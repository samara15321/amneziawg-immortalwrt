const axios = require('axios');
const cheerio = require('cheerio');
const core = require('@actions/core');

let version = process.argv[2];

if (version) {
  version = version.slice(1); // Удаление первого символа (например, 'v' или '/')
  console.log(`Версия без первого символа: ${version}`);
} else {
  console.log('Версия не была передана');
  core.setFailed('Version argument is required');
  process.exit(1);
}

const url = `https://downloads.immortalwrt.org/releases/${version}/targets/`;

async function fetchHTML(url) {
  try {
    const { data } = await axios.get(url);
    return cheerio.load(data);
  } catch (error) {
    console.error(`Error fetching HTML for ${url}: ${error.message}`);
    throw error;
  }
}

async function getTargets() {
  const $ = await fetchHTML(url);
  const targets = [];
  $('table tr td.n a').each((index, element) => {
    const name = $(element).attr('href');
    if (name && name.endsWith('/')) {
      targets.push(name.slice(0, -1));
    }
  });
  return targets;
}

async function getSubtargets(target) {
  const $ = await fetchHTML(`${url}${target}/`);
  const subtargets = [];
  $('table tr td.n a').each((index, element) => {
    const name = $(element).attr('href');
    if (name && name.endsWith('/')) {
      subtargets.push(name.slice(0, -1));
    }
  });
  return subtargets;
}

async function getDetails(target, subtarget) {
  const packagesUrl = `${url}${target}/${subtarget}/packages/`;
  const $ = await fetchHTML(packagesUrl);
  let vermagic = '';
  let pkgarch = '';

  $('a').each((index, element) => {
    const name = $(element).attr('href');
    if (name && name.startsWith('kernel_')) {
      const vermagicMatch = name.match(/kernel_\d+\.\d+\.\d+(?:-\d+)?[-~]([a-f0-9]+)(?:-r\d+)?_([a-zA-Z0-9_-]+)\.ipk$/);
      if (vermagicMatch) {
        vermagic = vermagicMatch[1];
        pkgarch = vermagicMatch[2];
        console.log(`Found vermagic: ${vermagic}, pkgarch: ${pkgarch} for target: ${target}, subtarget: ${subtarget}`);        
      }
    }
  });

  return { vermagic, pkgarch };
}

async function main() {
  try {
    const targets = await getTargets();
    const jobConfig = [];

    for (const target of targets) {
      const subtargets = await getSubtargets(target);
      for (const subtarget of subtargets) {
        const { vermagic, pkgarch } = await getDetails(target, subtarget);
        jobConfig.push({
          tag: version,
          target,
          subtarget,
          vermagic,
          pkgarch,
        });
      }
    }

    core.setOutput('job-config', JSON.stringify(jobConfig));
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();
