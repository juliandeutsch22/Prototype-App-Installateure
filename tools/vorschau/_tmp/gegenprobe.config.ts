import basis from '../../../playwright.links.config';
const ORT = 'http://localhost:5198/tools/vorschau/';
export default { ...basis, testDir: '../../../tests/links', use: { ...basis.use, baseURL: ORT }, projects: basis.projects?.filter((p) => p.name === 'chromium').map((p) => ({ ...p, use: { ...p.use, baseURL: ORT } })), webServer: undefined, outputDir: '/tmp/claude-0/-home-user/3a883db3-05a0-50cc-9242-0463130abcb1/scratchpad/e97/gegenprobe-ergebnis' };
