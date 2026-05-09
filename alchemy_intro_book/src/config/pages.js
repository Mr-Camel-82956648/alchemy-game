const defaultFallback = "./assets/images/pages/video-fallback.svg";

function createVideoPage(id, index, body) {
  return {
    id,
    mediaType: "video",
    mediaSrc: `./assets/videos/pages/p${String(index).padStart(2, "0")}.mp4`,
    posterSrc: defaultFallback,
    fallbackImageSrc: defaultFallback,
    title: "",
    body,
    isFinalPage: false,
    transition: {
      nextVideoSrc: "",
      mode: "direct",
    },
  };
}

export const introPages = [
  createVideoPage("p1", 1, [
    "这是一个神秘的炼金炉。",
    "凡投入其中之物，都将被改写，化作你意想不到的魔法。",
  ]),
  createVideoPage("p4", 2, [
    "投入一只魔龙，",
    "便能唤醒沉睡已久的远古力量",
  ]),
  createVideoPage("p5", 3, [
    "你将获得——",
    "来自「龙」的凶暴魔法。",
  ]),
  createVideoPage("p2", 4, [
    "投入一把利剑，",
    "让锋芒先接受炉火的洗礼。",
  ]),
  createVideoPage("p3", 5, [
    "你可召唤——",
    "自高空坠落的剑雨。",
  ]),
  createVideoPage("p6", 6, [
    "若将【火把】与【植物】一同投入炉中，",
    "炉火便会孕育出意想不到的变化。",
  ]),
  createVideoPage("p7", 7, [
    "你将获得——",
    "裹挟地火破土而出的灵木魔法。",
  ]),
  createVideoPage("p8", 8, [
    "但炉火并非永恒恩赐。",
    "唯有不断收割灵魂，才能让它长燃不熄",
  ]),
  createVideoPage("p9", 9, [
    "面对敌人时，",
    "只有相同属性的武器，才能真正撕开它们的躯壳。",
  ]),
  createVideoPage("p10", 10, [
    "若你判断失误，攻击不仅无效，",
    "反而会让敌人恢复生机，变得更加庞大而危险。",
  ]),
  {
    id: "p11",
    mediaType: "video",
    mediaSrc: "./assets/videos/pages/p11.mp4",
    posterSrc: defaultFallback,
    fallbackImageSrc: defaultFallback,
    title: "",
    body: [
      "现在，向炉火许下你的意志。",
      "进入游戏。",
    ],
    isFinalPage: true,
    transition: {
      nextVideoSrc: "",
      mode: "frame-zoom",
    },
  },
];
