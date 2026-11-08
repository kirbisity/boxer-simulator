// Story mode: drawing up his men before a battle (the deploy screen, storyview.js; the runner's 'deploy' phase). Pure data and
// pure readers (no DOM), run in Node by test/story-deploy.test.js.
//
// A battle may let a man of rank choose how his side stands and where he stands in it (its `deploy`):
//   deploy: {
//     formations: { from: <STORY_RANKS id>, default: <id>, options: [{ id, name: { zh, en }, note: { zh, en } }] },
//     posts:      { from: <STORY_RANKS id>, default: <id>, options: [{ id, name, note, formations?: [formation ids] }] },
//   }
// `from`: the lowest rank whose choice it is. The formation is the commander's: the man who leads the side as the game draws
// it (a 哨长 leads the patrol at Liaodong; the 把总 the column's foot at Sarhu); below him the side stands as history had
// it (the formations' `default`, the battle's own order). Where he stands is an officer's to choose (`posts.from`), the man
// who leads from where he can see and be seen; a man in the file stands where his officer puts him (ranks.js northRole).
// A post may hold in some formations only (`formations`: the second line where there is one). The battle's setup reads the
// choice (setup(life, seed, { deploy })) through storyDeployResolve, which gives the defaults for whatever is not his to
// choose or not chosen, so the page, a test and a headless run (runner.js storyRunBattle) all build the same field from it.
// Nothing here changes a man: the numbers, the kit and the drill are the battle's; only where its men stand.
// Names here are prefixed `storyDeploy` (the bundle is one shared scope: tools/bundle.js).

import { storyGradeOf, storyRankIndex } from './ranks.js';

// The page's words for it, both ways.
export const STORY_DEPLOY_WORDS = {
  title: { zh: '布阵', en: 'Draw up your men' },
  formation: { zh: '阵形', en: 'Formation' },
  post: { zh: '你的位置', en: 'Your place' },
  ordered: { zh: (name) => `上官定的阵形：${name}`, en: (name) => `Ordered by your officer: ${name}` },
  go: { zh: '上阵', en: 'Into battle' },
};

/** Whether a choice (`part`: a battle's deploy.formations or deploy.posts) is his: his grade at least its `from`. */
export function storyDeployHis(part, life) {
  if (!part?.options?.length) return false;
  const from = storyRankIndex(part.from ?? 'bing');
  return from >= 0 && storyRankIndex(storyGradeOf(life)) >= from;
}

/** The posts that hold in a formation (each post's `formations`, or every formation). */
export const storyDeployPostsIn = (posts, formation) => (posts?.options ?? []).filter((post) => !post.formations || post.formations.includes(formation));

/**
 * What the battle offers him to choose, or null (nothing his): { formations: [options] | null (not his: `ordered`, the
 * formation he is given), posts: [options] | null, defaults: { formation, post } }. The posts are all of the battle's; the
 * page shows those that hold in the formation chosen (storyDeployPostsIn).
 */
export function storyDeployOffer(battle, life) {
  const deploy = battle?.deploy;
  if (!deploy) return null;
  const formations = storyDeployHis(deploy.formations, life) ? deploy.formations.options : null;
  const posts = storyDeployHis(deploy.posts, life) ? deploy.posts.options : null;
  if (!formations && !posts) return null;
  const ordered = deploy.formations?.options?.find((option) => option.id === deploy.formations.default) ?? null;
  return { formations, posts, ordered: formations ? null : ordered, defaults: { formation: deploy.formations?.default ?? null, post: deploy.posts?.default ?? null } };
}

/**
 * The formation and post the battle is built with: his choice (`chosen`: { formation?, post? }) where it is his and holds,
 * else the defaults. `post` is null for a man whose post is not his to choose (the battle stands him by his rank). Returns
 * { formation, post }.
 */
export function storyDeployResolve(battle, life, chosen = null) {
  const deploy = battle?.deploy;
  if (!deploy) return { formation: null, post: null };
  const pick = (part, id) => (storyDeployHis(part, life) && part.options.some((option) => option.id === id) ? id : part?.default ?? null);
  const formation = pick(deploy.formations, chosen?.formation);
  if (!storyDeployHis(deploy.posts, life)) return { formation, post: null };
  const holding = storyDeployPostsIn(deploy.posts, formation);
  const post = holding.some((option) => option.id === chosen?.post) ? chosen.post
    : holding.some((option) => option.id === deploy.posts.default) ? deploy.posts.default : holding[0]?.id ?? null;
  return { formation, post };
}
