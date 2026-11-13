(() => {
  'use strict';

  const button = document.getElementById('check-updates');
  const status = document.getElementById('update-status');
  if (!button || !status) return;

  const repository = document.documentElement.dataset.githubRepo || 'TgCharlie/TrendCadSolid';
  const fallbackVersion = document.documentElement.dataset.appVersion || '0.2.1';
  let releaseUrl = '';
  const versionLabel = document.getElementById('app-version');
  if (versionLabel) versionLabel.textContent = `v${fallbackVersion}`;

  const currentVersion = () => window.trendcadApp?.version || fallbackVersion;
  const setStatus = (text, state = '') => { status.textContent = text; status.dataset.state = state; };
  const parseVersion = version => {
    const match = String(version || '').replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    return match ? [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)] : [0, 0, 0];
  };
  const isNewer = (latest, current) => {
    const a = parseVersion(latest), b = parseVersion(current);
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
  };

  async function browserCheck() {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);
    const release = await response.json();
    const latestVersion = String(release.tag_name || '').replace(/^v/i, '');
    return { currentVersion: currentVersion(), latestVersion, updateAvailable: isNewer(latestVersion, currentVersion()), releaseName: release.name, releaseUrl: release.html_url, assets: release.assets || [], repository };
  }

  async function openRelease(url) {
    if (!url) return;
    if (window.trendcadApp?.openRelease) await window.trendcadApp.openRelease(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function checkForUpdates() {
    button.disabled = true;
    button.textContent = 'Checking…';
    setStatus('Checking GitHub Releases…', 'checking');
    try {
      const result = window.trendcadApp?.checkForUpdates ? await window.trendcadApp.checkForUpdates() : await browserCheck();
      if (result.error) throw new Error(result.error);
      releaseUrl = result.releaseUrl || '';
      if (result.updateAvailable) {
        button.disabled = false;
        button.textContent = `Download v${result.latestVersion}`;
        setStatus(`Update available: v${result.latestVersion}`, 'available');
      } else {
        button.disabled = false;
        button.textContent = 'Check for updates';
        setStatus(`You’re up to date · v${result.currentVersion}`, 'current');
      }
    } catch (error) {
      releaseUrl = '';
      button.disabled = false;
      button.textContent = 'Check for updates';
      setStatus(`Update check failed · ${error.message}`, 'error');
    }
  }

  button.addEventListener('click', () => releaseUrl ? openRelease(releaseUrl) : checkForUpdates());
  if (window.trendcadApp?.getInfo) window.trendcadApp.getInfo().then(info => { if (info?.version && versionLabel) versionLabel.textContent = `v${info.version}`; }).catch(() => {});
})();
