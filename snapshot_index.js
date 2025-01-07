const axios = require('axios');
const cheerio = require('cheerio');
const core = require('@actions/core');

const version = process.argv[2]; // Получение версии OpenWRT из аргумента командной строки

const SNAPSHOT_TARGETS_TO_BUILD = ['mediatek', 'ramips', 'x86', 'armsr', 'rockchip'];
const SNAPSHOT_SUBTARGETS_TO_BUILD = ['filogic', 'mt7622', 'mt7623', 'mt7629', 'mt7620', 'mt7621', 'mt76x8', '64', 'generic', 'armv8'];

if (!version) {
  core.setFailed('Version argument is required');
  process.exit(1);
}

const url = version === 'SNAPSHOT' ? 'https://downloads.immortalwrt.org/snapshots/targets/' : `https://downloads.immortalwrt.org/releases/${version}/targets/`;

async function fetchHTML(url) {
  try {
    const { data } = await axios.get(url);
    return cheerio.load(data);
  } catch (error) {
    console.error(`Error fetching HTML for ${url}: ${error}`);
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
  const profilesUrl = `${url}${target}/${subtarget}/profiles.json`;
  const packagesUrl = `${url}${target}/${subtarget}/packages/`;
  let vermagic = '';
  let pkgarch = '';

  try {
    const $ = await fetchHTML(packagesUrl);
    $('a').each((index, element) => {
      const name = $(element).attr('href');
      if (name && name.startsWith('kernel-')) {
        const vermagicMatch = name.match(/kernel-\d+\.\d+\.\d+~([a-f0-9]{10,})(?:-r\d+)?\.apk$/);
        if (vermagicMatch) {
          vermagic = vermagicMatch[1];  // Сохраняем значение vermagic
          console.log(`Found vermagic: ${vermagic} for ${target}/${subtarget}`);
        }
      }
    });

    const response = await axios.get(profilesUrl);
    const data = response.data;
    if (data && data['arch_packages']) {
      pkgarch = data['arch_packages'];
    }
  } catch (error) {
    console.error(`Error fetching data for ${target}/${subtarget}: ${error.message}`);
  }

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

        if (version !== 'SNAPSHOT' || (SNAPSHOT_SUBTARGETS_TO_BUILD.includes(subtarget) && SNAPSHOT_TARGETS_TO_BUILD.includes(target))) {
          jobConfig.push({
            tag: version,
            target,
            subtarget,
            vermagic,
            pkgarch,
          });
        }
      }
    }

    core.setOutput('job-config', JSON.stringify(jobConfig));
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();
