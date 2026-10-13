/**
 * 从 Wikidata SPARQL 拉取「传统故事 / 神话 / 传说 / 民间故事」并带坐标，
 * 转换为标准 GeoJSON（src/geo/data/world-myths.json）。
 *
 * 运行： node src/geo/scripts/fetch-wikidata-myths.mjs
 * 依赖： Node 18+（内置 fetch）。无需任何 API key。
 *
 * Wikidata 是 CC0 公共领域数据；条目本身为结构化事实，不涉及文本版权。
 * 若网络不可达或返回 0 条，则写入一份内置的「公共版权世界神话」兜底数据集，
 * 保证地图始终有可渲染的全球神话图层。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../data/world-myths.json');

const SPARQL = `
SELECT ?item ?itemLabel ?coord ?typeLabel ?article WHERE {
  ?item wdt:P31/wdt:P279* wd:Q7832362 .
  ?item wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P31 ?type . }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "zh,en" . }
}
LIMIT 4000
`;

function classify(typeLabel = '') {
  const t = String(typeLabel).toLowerCase();
  if (t.includes('神话') || t.includes('myth')) return { category: '神话', catIndex: 0 };
  if (t.includes('传说') || t.includes('legend')) return { category: '传说', catIndex: 1 };
  if (t.includes('民间') || t.includes('folk') || t.includes('fairy') || t.includes('tale'))
    return { category: '民间故事', catIndex: 2 };
  return { category: '神话', catIndex: 0 };
}

function parseCoord(coord) {
  // wikibase returns "Point(lon lat)" with geo:wktLiteral datatype
  const m = String(coord).match(/Point\(\s*([-0-9.]+)\s+([-0-9.]+)\s*\)/);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2])];
}

function toFeature(b) {
  const coord = parseCoord(b.coord?.value);
  if (!coord) return null;
  const qid = String(b.item?.value || '').split('/').pop();
  const { category, catIndex } = classify(b.typeLabel?.value);
  const wiki = b.article?.value;
  const sourceUrl = wiki || `https://www.wikidata.org/wiki/${qid}`;
  const sourceType = wiki ? 'wikipedia' : 'wikidata';
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coord },
    properties: {
      id: qid,
      name: b.itemLabel?.value || qid,
      category,
      catIndex,
      province: '',
      site: 'Wikidata',
      value: 60,
      summary: `${category} · 来源 ${sourceType === 'wikipedia' ? 'Wikipedia' : 'Wikidata'}`,
      source: sourceType === 'wikipedia' ? 'Wikipedia' : 'Wikidata',
      sourceType,
      sourceUrl,
    },
  };
}

// 离线兜底：公共版权世界神话（坐标取主要流传地/标志性遗址）
const FALLBACK = {
  type: 'FeatureCollection',
  metadata: {
    title: '全球神话 / 传说 地理分布（兜底数据集）',
    description: 'Wikidata 拉取失败时的离线兜底：选自公共版权神话/史诗的标志性传播地坐标。',
    categoryLegend: { '0': '神话', '1': '传说', '2': '民间故事' },
    generated: new Date().toISOString().slice(0, 10),
    fallback: true,
  },
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [22.86, 40.08] }, properties: { id: 'olympus', name: '奥林匹斯诸神（宙斯）', category: '神话', catIndex: 0, province: '希腊', site: '奥林匹斯山', value: 90, summary: '希腊神话：宙斯与众神居奥林匹斯，主掌雷电与天界。', source: '希腊神话', sourceType: 'wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Mount_Olympus' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [26.24, 39.96] }, properties: { id: 'troy', name: '特洛伊战争', category: '传说', catIndex: 1, province: '土耳其', site: '特洛伊遗址', value: 85, summary: '荷马史诗：特洛伊十年围城，木马破城。', source: '《伊利亚特》', sourceType: 'wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Troy' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [22.50, 38.48] }, properties: { id: 'delphi', name: '德尔斐神谕（阿波罗）', category: '神话', catIndex: 0, province: '希腊', site: '德尔斐', value: 78, summary: '阿波罗神谕之所，铭刻“认识你自己”。', source: '希腊神话', sourceType: 'wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Delphi' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [17.63, 59.86] }, properties: { id: 'asgard', name: '阿斯加德（奥丁/索尔）', category: '神话', catIndex: 0, province: '北欧', site: '（神话域·乌斯萨拉）', value: 82, summary: '北欧神话：奥丁居阿斯加德，索尔掌雷霆。', source: '北欧神话', sourceType: 'wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Asgard' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [31.50, 25.70] }, properties: { id: 'osiris', name: '奥西里斯（冥界之王）', category: '神话', catIndex: 0, province: '埃及', site: '阿拜多斯', value: 80, summary: '埃及神话：奥西里斯死而复生，掌冥界与丰饶。', source: '埃及神话', sourceType: 'wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Osiris' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [45.64, 31.32] }, properties: { id: 'gilgamesh', name: '吉尔伽美什', category: '史诗', catIndex: 2, province: '伊拉克', site: '乌鲁克', value: 83, summary: '苏美尔史诗：乌鲁克王吉尔伽美什求永生。', source: '《吉尔伽美什史诗》', sourceType: 'wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Gilgamesh' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [81.86, 26.80] }, properties: { id: 'ramayana', name: '罗摩（罗摩衍那）', category: '史诗', catIndex: 2, province: '印度', site: '阿约提亚', value: 84, summary: '印度史诗：罗摩救妻悉多，伐罗波那。', source: '《罗摩衍那》', sourceType: 'wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Rama' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-98.84, 19.69] }, properties: { id: 'quetzalcoatl', name: '羽蛇神魁扎尔科亚特尔', category: '神话', catIndex: 0, province: '墨西哥', site: '特奥蒂瓦坎', value: 76, summary: '中美洲神话：羽蛇神掌风与晨星。', source: '阿兹特克/玛雅神话', sourceType: 'wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Quetzalcoatl' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-155.85, 19.50] }, properties: { id: 'maui', name: '毛伊（波利尼西亚）', category: '神话', catIndex: 0, province: '夏威夷', site: '（波利尼西亚）', value: 70, summary: '波利尼西亚神话：毛伊以钩钓起岛屿、捕太阳。', source: '波利尼西亚神话', sourceType: 'wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Māui_(Hawaiian_mythology)' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.20, 5.60] }, properties: { id: 'anansi', name: '阿南西（蜘蛛）', category: '民间故事', catIndex: 2, province: '加纳', site: '（西非/加纳）', value: 68, summary: '西非/加勒比民间故事：蜘蛛阿南西以智取胜。', source: '阿坎民间故事', sourceType: 'wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Anansi' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-4.76, 50.67] }, properties: { id: 'arthur', name: '亚瑟王', category: '传说', catIndex: 1, province: '英国', site: '廷塔哲', value: 86, summary: '不列颠传说：亚瑟王拔石中剑，圆桌骑士。', source: '亚瑟王传说', sourceType: 'wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/King_Arthur' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-1.07, 53.07] }, properties: { id: 'robin', name: '罗宾汉', category: '民间故事', catIndex: 2, province: '英国', site: '舍伍德森林', value: 80, summary: '英格兰民间故事：罗宾汉劫富济贫。', source: '英格兰民谣', sourceType: 'wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Robin_Hood' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [12.08, 55.61] }, properties: { id: 'beowulf', name: '贝奥武甫', category: '史诗', catIndex: 2, province: '丹麦', site: '莱雷', value: 78, summary: '古英语史诗：贝奥武甫斩妖龙。', source: '《贝奥武甫》', sourceType: 'wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Beowulf' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-63.70, 60.70] }, properties: { id: 'sedna', name: '塞德娜（因纽特）', category: '神话', catIndex: 0, province: '因纽特', site: '（北极）', value: 64, summary: '因纽特神话：海兽之母塞德娜掌海洋生灵。', source: '因纽特神话', sourceType: 'wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Sedna_(mythology)' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [28.90, -1.60] }, properties: { id: 'mwindo', name: '姆温多（Nyanga）', category: '史诗', catIndex: 2, province: '刚果', site: '（尼亚加）', value: 62, summary: '中非尼亚加史诗：英雄姆温多历险。', source: '《姆温多史诗》', sourceType: 'wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Mwindo_epic' } },
  ],
};

async function main() {
  let features = [];
  try {
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(SPARQL)}&format=json`;
    console.log('[wikidata] querying SPARQL endpoint...');
    const res = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'geo-folktales-fetch/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const bindings = json?.results?.bindings || [];
    for (const b of bindings) {
      const f = toFeature(b);
      if (f) features.push(f);
    }
    console.log(`[wikidata] got ${features.length} features with coordinates`);
  } catch (e) {
    console.warn('[wikidata] fetch failed:', e.message);
  }

  let out;
  if (features.length === 0) {
    console.log('[wikidata] using offline fallback dataset');
    out = FALLBACK;
  } else {
    // 去重（同一 item 可能多行）
    const seen = new Set();
    features = features.filter((f) => {
      if (seen.has(f.properties.id)) return false;
      seen.add(f.properties.id);
      return true;
    });
    out = {
      type: 'FeatureCollection',
      metadata: {
        title: '全球神话 / 传说 地理分布（Wikidata）',
        description: '由 Wikidata SPARQL 自动拉取的传统故事条目（含坐标）。CC0 公共领域数据。运行 src/geo/scripts/fetch-wikidata-myths.mjs 可刷新。',
        categoryLegend: { '0': '神话', '1': '传说', '2': '民间故事' },
        generated: new Date().toISOString().slice(0, 10),
        count: features.length,
      },
      features,
    };
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log(`[wikidata] wrote ${out.features.length} features -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
