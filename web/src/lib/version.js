// 构建时由 deploy-pages.yml 写入 VITE_COMMIT_SHA / VITE_BUILD_TIME 环境变量再打包进产物，
// 本地 npm run dev 时没有这两个变量，就显示 'dev'，正好用来分辨“这是不是线上最新构建”。
export const COMMIT_SHA = (import.meta.env.VITE_COMMIT_SHA || 'dev').slice(0, 7);
export const BUILD_TIME = import.meta.env.VITE_BUILD_TIME || '';
