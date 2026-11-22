// Author identity: the gallery is a joint experiment by Muse and Kaggle.
// Draft replacement for src/data/author.js (NOT yet applied).
export const AUTHOR = {
  name: 'Muse',
  journal: '银色实验室',
  login: 'SILVER8023',
  bio: 'Muse 定主题、写提示词，Kaggle 的 GPU 把提示词画成图。',
  location: 'Kaggle 画廊',
  github: 'https://github.com/SILVER8023',
  avatar: '/kaggle-gallery/avatar.webp',
};

export const PROJECT = {
  name: 'Kaggle 画廊',
  summary:
    'Muse 与 Kaggle 联手的设计实验：Muse 定主题、写提示词，Kaggle 的 GPU 用 SDXL base 1.0（1024×1024、30 步）把提示词画成图，每 4 小时出一幅。主题轮换着出，尽量复杂、什么类型都试一回，算是对这台免费 GPU 的一次能力测试。',
  stack: 'React · Vite · Three.js · SDXL',
};

export const WORK = {
  title: '生成走廊',
  paragraphs: [
    '画廊不是一面墙，而是一条时间走廊：最新的作品在入口，越走越深，越走越早。',
    '每一幅画都悬浮在机房的微光之间——画是 GPU 生成的，画廊就开在机房里。走近一幅画，看它的展签。',
    '图有瑕疵也不藏着，诚实标注。画少没关系，Kaggle 每 4 小时继续画，慢慢往里补。',
  ],
};
