// Loads content packs from /content and builds lookup indexes.
//
// Layout:
//   content/packs.json                 -> { "packs": ["k8s-architecture", ...] }
//   content/<pack>/pack.json           -> { id, title, units: ["01-foo", ...] }
//   content/<pack>/units/<unit>.json   -> { id, title, concepts: [ ... ] }
//
// Adding a subject = drop a folder in /content and list it in packs.json.

const CONTENT_ROOT = new URL('../../content/', import.meta.url);

export const ITEM_TYPES = ['mcq', 'multi', 'fill', 'order', 'match'];

/** @type {{packs:any[], byPack:Map, byUnit:Map, byConcept:Map, byItem:Map, items:any[], problems:string[]}} */
export const content = {
  packs: [],
  byPack: new Map(),
  byUnit: new Map(),
  byConcept: new Map(),
  byItem: new Map(),
  items: [],
  problems: [],
};

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

function problem(msg) {
  content.problems.push(msg);
  console.warn('[content]', msg);
}

function validateItem(item, ctx) {
  const where = `${ctx} item "${item.id ?? '(no id)'}"`;
  if (!item.id) return problem(`${where}: missing id`);
  if (!ITEM_TYPES.includes(item.type)) return problem(`${where}: unknown type "${item.type}"`);
  if (!item.prompt) problem(`${where}: missing prompt`);
  switch (item.type) {
    case 'mcq':
      if (!Array.isArray(item.choices) || item.choices.length < 2) problem(`${where}: needs >=2 choices`);
      if (typeof item.answer !== 'number' || !item.choices?.[item.answer]) problem(`${where}: bad answer index`);
      break;
    case 'multi':
      if (!Array.isArray(item.choices) || item.choices.length < 3) problem(`${where}: needs >=3 choices`);
      if (!Array.isArray(item.answers) || !item.answers.length) problem(`${where}: needs answers[]`);
      break;
    case 'fill':
      if (!Array.isArray(item.accept) || !item.accept.length) problem(`${where}: needs accept[]`);
      break;
    case 'order':
      if (!Array.isArray(item.steps) || item.steps.length < 3) problem(`${where}: needs >=3 steps`);
      break;
    case 'match':
      if (!Array.isArray(item.pairs) || item.pairs.length < 3) problem(`${where}: needs >=3 pairs`);
      break;
  }
  if (!item.explain) problem(`${where}: missing explain`);
}

export async function loadContent() {
  content.packs = [];
  content.problems = [];
  content.items = [];
  content.byPack.clear(); content.byUnit.clear(); content.byConcept.clear(); content.byItem.clear();

  const index = await getJSON(new URL('packs.json', CONTENT_ROOT));
  const packIds = index.packs || [];

  for (const packId of packIds) {
    let meta;
    try {
      meta = await getJSON(new URL(`${packId}/pack.json`, CONTENT_ROOT));
    } catch (e) {
      problem(`pack "${packId}": ${e.message}`);
      continue;
    }
    const pack = {
      id: meta.id || packId,
      dir: packId,
      title: meta.title || packId,
      subtitle: meta.subtitle || '',
      emoji: meta.emoji || '📘',
      accent: meta.accent || null,
      description: meta.description || '',
      units: [],
      itemCount: 0,
    };

    for (const unitFile of meta.units || []) {
      let raw;
      try {
        raw = await getJSON(new URL(`${packId}/units/${unitFile}.json`, CONTENT_ROOT));
      } catch (e) {
        problem(`unit "${packId}/${unitFile}": ${e.message}`);
        continue;
      }
      const unit = {
        id: `${pack.id}/${raw.id || unitFile}`,
        shortId: raw.id || unitFile,
        packId: pack.id,
        title: raw.title || unitFile,
        summary: raw.summary || '',
        index: pack.units.length,
        concepts: [],
        itemCount: 0,
      };

      for (const c of raw.concepts || []) {
        const concept = {
          id: `${unit.id}/${c.id}`,
          shortId: c.id,
          packId: pack.id,
          unitId: unit.id,
          title: c.title || c.id,
          brief: c.brief || '',
          examples: c.examples || [],
          links: c.links || [],
          items: [],
        };
        for (const it of c.items || []) {
          validateItem(it, `${unit.shortId}/${c.id}`);
          const item = {
            ...it,
            id: `${concept.id}/${it.id}`,
            shortId: it.id,
            conceptId: concept.id,
            unitId: unit.id,
            packId: pack.id,
          };
          concept.items.push(item);
          content.items.push(item);
          content.byItem.set(item.id, item);
        }
        if (!concept.items.length) problem(`concept "${concept.id}": no items`);
        unit.itemCount += concept.items.length;
        unit.concepts.push(concept);
        content.byConcept.set(concept.id, concept);
      }

      pack.itemCount += unit.itemCount;
      pack.units.push(unit);
      content.byUnit.set(unit.id, unit);
    }

    content.packs.push(pack);
    content.byPack.set(pack.id, pack);
  }

  return content;
}

export const allConcepts = () => content.packs.flatMap((p) => p.units.flatMap((u) => u.concepts));
export const conceptsOfUnit = (unitId) => content.byUnit.get(unitId)?.concepts ?? [];
export const itemsOfUnit = (unitId) => conceptsOfUnit(unitId).flatMap((c) => c.items);
export const itemsOfPack = (packId) => content.byPack.get(packId)?.units.flatMap((u) => u.concepts.flatMap((c) => c.items)) ?? [];
