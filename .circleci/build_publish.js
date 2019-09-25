#!/usr/bin/env node
const path = require('path');
const fs = require('fs-extra');
const S3 = require('aws-sdk/clients/s3');
const { resolve: urlResolve } = require('url');
const execa = require('execa');
const walk = require('klaw');

// For quick debugging - print red errors
console.red = (...args) => console.error.apply(this, ["\033[31m", ...args, "\033[0m"]);

const s3Options = {
  accessKeyId: process.env.S3_ACCESS_KEY_ID, //TODO - move to ENV
  secretAccessKey: process.env.S3_SECRET_KEY
}

const targets = {
  incubator: {
    bucket: "swarmpack-incubator",
    url: "http://swarmpack-incubator.s3-website-ap-southeast-1.amazonaws.com",
    region: "ap-southeast-1"
  }
};

async function uploadFileToBucket(filePath, bucket) {

  const s3 = new S3( s3Options );

  const upload = new S3.ManagedUpload({
    service: s3,
    params: {
      Bucket: bucket,
      Key: path.basename(filePath),
      Body: fs.createReadStream(filePath)
    }
  });

  return new Promise((resolve, reject) => {
    console.log(`Uploaded file: ${path.basename(filePath)}`);
    upload.send((err, response) => {
      err ? reject(err) : resolve(response);
    });
  })

}

async function listPackBundlesInBucket(bucket) {
  return new Promise((resolve, reject) => {
    const s3 = new S3( s3Options );
    s3.listObjects({ Bucket: bucket }, function(err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(data.Contents.map(e => e.Key).filter(e => e.endsWith('.tgz')))
      }
    })
  });
}

(async () => {

  // Each target, e.g. 'incubator' is a unique directory with it's own S3 bucket etc
  for (let [target, { bucket, url }] of Object.entries(targets)) {

    // Assumes CWD is root of repo
    const targetDir = path.resolve(process.cwd(), target);
    // Create a temporary .repo dir in which to bundle packs
    const repoDir = path.join(targetDir, '.repo');
    fs.ensureDirSync(repoDir);
    fs.emptyDir(repoDir);

    const bucketFiles = await listPackBundlesInBucket(bucket)

    const packDirs = await fs.readdir(targetDir);

    // Create bundle for each pack directory found
    for (let dir of packDirs) {
      const packDir = path.join(targetDir, dir);
      if (fs.statSync(packDir).isDirectory() && dir !== '.repo') {
        try {
          const { stdout, stderr } = await execa('swarm-pack', ['pack:bundle', packDir , '--output-path', repoDir]);
          console.log(stdout);
          console.red(stderr);
        } catch (error) {
          console.red(error);
        }
      }
    }

    // Remove local files which exist already in S3
    const packBundles = await fs.readdir(repoDir);
    for (let bundle of packBundles) {
      if (bucketFiles.includes(bundle)) {
        fs.remove(path.join(repoDir, bundle));
      }
    }

    // Create index.yml extending original
    try {
      const { stdout, stderr } = await execa('swarm-pack', ['repo:index', '--merge', urlResolve(url, 'index.yml'), '--url', url, '--output-path', repoDir]);
      console.log(stdout);
      console.red(stderr);
    } catch (error) {
      console.log(error);
      console.log('fail')
    }


    // Upload everything under .repo to S3
    const filesToSync = await fs.readdir(repoDir);

    // Create bundle for each pack directory found
    for (let file of filesToSync) {
      const filePath = path.join(repoDir, file);
      if (fs.statSync(filePath).isFile()) {
        try {
          uploadFileToBucket(filePath, bucket)
        } catch(e) {
          console.red(e);
        }
      }
    }

  }
})();

