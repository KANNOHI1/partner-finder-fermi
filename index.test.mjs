import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

function createElement(id, initial = {}) {
  return {
    id,
    value: initial.value ?? "",
    innerHTML: initial.innerHTML ?? "",
    textContent: initial.textContent ?? "",
    hidden: initial.hidden ?? false,
    disabled: initial.disabled ?? false,
    checked: initial.checked ?? false,
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    removeAttribute(name) {
      delete this[name];
    }
  };
}

function loadApp() {
  const elements = {
    controls: createElement("controls"),
    ageMin: createElement("ageMin"),
    ageMax: createElement("ageMax"),
    maritalField: createElement("maritalField"),
    m_unmarried: createElement("m_unmarried", { checked: true }),
    m_divorced: createElement("m_divorced", { checked: false }),
    m_widowed: createElement("m_widowed", { checked: false }),
    income: createElement("income"),
    education: createElement("education", { value: "none" }),
    residence: createElement("residence", { value: "nationwide" }),
    nationalityField: createElement("nationalityField"),
    nationality: createElement("nationality", { value: "any" }),
    height: createElement("height"),
    smoking: createElement("smoking", { value: "any" }),
    assetField: createElement("assetField"),
    asset: createElement("asset", { value: "0", disabled: true }),
    baldnessField: createElement("baldnessField", { hidden: true }),
    baldness: createElement("baldness", { value: "any" }),
    targetLabel: createElement("targetLabel"),
    targetSubtext: createElement("targetSubtext"),
    rangeBadge: createElement("rangeBadge"),
    summaryText: createElement("summaryText"),
    countValue: createElement("countValue"),
    overallRateValue: createElement("overallRateValue"),
    ageBandRateValue: createElement("ageBandRateValue"),
    rarityComment: createElement("rarityComment"),
    encounterFeel: createElement("encounterFeel"),
    breakdown: createElement("breakdown"),
    ageDetails: createElement("ageDetails"),
    dataLimitations: createElement("dataLimitations"),
    footer: createElement("footer")
  };

  const radios = [
    { name: "selfGender", value: "female", checked: true },
    { name: "selfGender", value: "male", checked: false }
  ];

  const document = {
    getElementById(id) {
      return elements[id] ?? null;
    },
    querySelector(selector) {
      if (selector === 'input[name="selfGender"]:checked') {
        return radios.find((radio) => radio.checked) ?? null;
      }
      if (selector === "footer") {
        return elements.footer;
      }
      return null;
    }
  };

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(scripts.length > 0, "inline script should exist");

  const instrumentedScript = `${scripts.join("\n")}
globalThis.__testExports = {
  AGE_BUCKETS,
  MARITAL_DISTRIBUTION,
  NATIONALITY_RATES,
  INCOME_DISTRIBUTION,
  ASSET_CONDITIONAL_RATES,
  EDUCATION_RATES,
  NON_BALDNESS_RATES_MALE,
  HEIGHT_RATES,
  HEIGHT_OPTIONS,
  computeEstimate: globalThis.computeEstimate ?? computeEstimate,
  formatPeople,
  formatPercent,
  getEducationRate: globalThis.getEducationRate ?? getEducationRate,
  getHeightRate: globalThis.getHeightRate ?? getHeightRate,
  getIncomeRateByAge: globalThis.getIncomeRateByAge ?? getIncomeRateByAge,
  getAssetRate: globalThis.getAssetRate ?? getAssetRate,
  getBaldnessRate: globalThis.getBaldnessRate ?? getBaldnessRate,
  getMaritalPool: globalThis.getMaritalPool ?? getMaritalPool,
  getNationalityRate: globalThis.getNationalityRate ?? getNationalityRate,
  getSmokingRate: globalThis.getSmokingRate ?? getSmokingRate,
  handleGenderChange: globalThis.handleGenderChange ?? handleGenderChange,
  handleMaritalCheckboxChange: globalThis.handleMaritalCheckboxChange ?? handleMaritalCheckboxChange,
  render: globalThis.render ?? render,
  syncAssetAvailability: globalThis.syncAssetAvailability ?? syncAssetAvailability
};`;

  const context = {
    console,
    document,
    window: null
  };
  context.window = context;

  vm.createContext(context);
  vm.runInContext(instrumentedScript, context);

  return {
    context,
    document,
    elements,
    radios,
    exports: context.__testExports
  };
}

function setSelfGender(app, value) {
  for (const radio of app.radios) {
    radio.checked = radio.value === value;
  }
}

function approxEqual(actual, expected, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("source includes marital, nationality, asset, baldness, and age details sections", () => {
  assert.match(html, /class=['"]age-sep['"]/);
  assert.match(html, /id=['"]maritalField['"]/);
  assert.match(html, /id=['"]nationalityField['"]/);
  assert.match(html, /id=['"]assetField['"]/);
  assert.match(html, /id=['"]baldnessField['"]/);
  assert.match(html, /id=['"]ageDetails['"]/);
});

test("getAssetRate only applies once the income threshold enables the asset filter", () => {
  const app = loadApp();
  assert.equal(app.exports.getAssetRate(500, 1000), 1);
  approxEqual(app.exports.getAssetRate(1000, 1000), 0.575);
});

test("computeEstimate aggregates per age bucket and returns perAgeResults", () => {
  const app = loadApp();
  setSelfGender(app, "female");
  app.elements.ageMin.value = "20";
  app.elements.ageMax.value = "25";
  app.elements.residence.value = "tokyo";
  app.elements.nationality.value = "any";
  app.elements.m_unmarried.checked = true;
  app.elements.m_divorced.checked = false;
  app.elements.m_widowed.checked = false;
  app.elements.income.value = "1000";
  app.elements.asset.value = "1000";
  app.elements.education.value = "kyutei";
  app.elements.height.value = "175";
  app.elements.smoking.value = "nonsmoker";
  app.elements.baldness.value = "nonbald";

  const result = app.exports.computeEstimate();
  assert.equal(result.perAgeResults.length, 2);

  const expected = [20, 25].reduce((sum, ageKey) => {
    const ageLabel = `${ageKey}-${ageKey + 4}`;
    const n0 = app.exports.getMaritalPool("male", "東京都内", ageLabel, {
      unmarried: true,
      divorced: false,
      widowed: false
    });
    const nNat = n0 * app.exports.getNationalityRate("東京都内", ageLabel, "any");
    const nInc = nNat * app.exports.getIncomeRateByAge("male", "tokyo", ageKey, 1000);
    const nAsset = nInc * app.exports.getAssetRate(1000, 1000, ageKey);
    const nEdu = nAsset * app.exports.getEducationRate("male", "kyutei");
    const nHeight = nEdu * app.exports.getHeightRate("male", "175");
    const nSmoke = nHeight * app.exports.getSmokingRate("male", "nonsmoker");
    const nBald = nSmoke * app.exports.getBaldnessRate("male", ageKey, "nonbald");
    return sum + nBald;
  }, 0);

  approxEqual(result.finalCount, expected, 1e-3);
});

test("syncAssetAvailability toggles the asset selector by income threshold", () => {
  const app = loadApp();
  app.elements.income.value = "500";
  app.exports.syncAssetAvailability();
  assert.equal(app.elements.asset.disabled, true);

  app.elements.income.value = "600";
  app.exports.syncAssetAvailability();
  assert.equal(app.elements.asset.disabled, false);
});

test("handleGenderChange only shows the baldness selector when the target is male", () => {
  const app = loadApp();
  setSelfGender(app, "female");
  app.exports.handleGenderChange();
  assert.equal(app.elements.baldnessField.hidden, false);

  setSelfGender(app, "male");
  app.exports.handleGenderChange();
  assert.equal(app.elements.baldnessField.hidden, true);
});

test("render outputs clarified breakdown labels, age detail rows, and limitation text", () => {
  const app = loadApp();
  app.exports.render();

  assert.match(app.elements.breakdown.innerHTML, /母数（年齢×居住地×婚姻状態）/);
  assert.match(app.elements.breakdown.innerHTML, /国籍/);
  assert.match(app.elements.breakdown.innerHTML, /年収（地域内分布）/);
  assert.match(app.elements.breakdown.innerHTML, /資産（年収条件付き）/);
  assert.match(app.elements.ageDetails.innerHTML, /20-24歳/);
  assert.match(app.elements.dataLimitations.textContent, /国勢調査/);
  assert.match(app.elements.footer.textContent, /AGA/);
});

test("render outputs encounter feel card with party scenario text", () => {
  const app = loadApp();
  app.exports.render();

  assert.match(app.elements.encounterFeel.textContent, /婚活パーティで 100 人/);
});

test("getMaritalPool sums selected categories", () => {
  const app = loadApp();
  const unmarriedOnly = app.exports.getMaritalPool("male", "全国", "30-34", {
    unmarried: true,
    divorced: false,
    widowed: false
  });
  const unmarriedPlusDivorced = app.exports.getMaritalPool("male", "全国", "30-34", {
    unmarried: true,
    divorced: true,
    widowed: false
  });

  assert.ok(unmarriedPlusDivorced > unmarriedOnly);
});

test("getNationalityRate reflects regional variation", () => {
  const app = loadApp();
  const tokyoForeign = app.exports.getNationalityRate("東京都内", "20-24", "foreign");
  const nationwideForeign = app.exports.getNationalityRate("全国", "20-24", "foreign");

  assert.ok(tokyoForeign > nationwideForeign);
});

test("getAssetRate decreases for younger ages", () => {
  const app = loadApp();
  const rate20 = app.exports.getAssetRate(1000, 1000, 20);
  const rate35 = app.exports.getAssetRate(1000, 1000, 35);
  const rate45 = app.exports.getAssetRate(1000, 1000, 45);
  assert.ok(rate20 < rate35, `20代資産率(${rate20}) < 35-39歳(${rate35}) であるべき`);
  assert.ok(rate35 < rate45, `35-39歳資産率(${rate35}) < 45-49歳(${rate45}) であるべき`);
  // 既存の2引数呼び出しは35-44ベース(係数1.0)で動くこと
  approxEqual(app.exports.getAssetRate(1000, 1000), 0.575);
});

test("source includes hokkaido and sapporo residence options", () => {
  assert.match(html, /<option value="hokkaido">北海道<\/option>/);
  assert.match(html, /<option value="sapporo">札幌市<\/option>/);
});

test("computeEstimate supports hokkaido and sapporo residences", () => {
  const app = loadApp();
  setSelfGender(app, "female");
  app.elements.ageMin.value = "30";
  app.elements.ageMax.value = "30";
  app.elements.nationality.value = "any";
  app.elements.m_unmarried.checked = true;
  app.elements.m_divorced.checked = false;
  app.elements.m_widowed.checked = false;
  app.elements.income.value = "500";
  app.elements.asset.value = "0";
  app.elements.education.value = "none";
  app.elements.height.value = "none";
  app.elements.smoking.value = "any";
  app.elements.baldness.value = "any";

  for (const residence of ["hokkaido", "sapporo"]) {
    app.elements.residence.value = residence;
    const result = app.exports.computeEstimate();
    assert.ok(result.finalCount > 0, `${residence} should return a positive estimate`);
    assert.ok(Number.isFinite(result.finalCount), `${residence} should return a finite estimate`);
  }
});

test("regional overlap counts remain monotonic for nested areas", () => {
  const app = loadApp();
  setSelfGender(app, "female");
  app.elements.ageMin.value = "30";
  app.elements.ageMax.value = "30";
  app.elements.nationality.value = "any";
  app.elements.m_unmarried.checked = true;
  app.elements.m_divorced.checked = false;
  app.elements.m_widowed.checked = false;
  app.elements.income.value = "500";
  app.elements.asset.value = "0";
  app.elements.education.value = "none";
  app.elements.height.value = "none";
  app.elements.smoking.value = "any";
  app.elements.baldness.value = "any";

  app.elements.residence.value = "hokkaido";
  const hokkaido = app.exports.computeEstimate();
  app.elements.residence.value = "sapporo";
  const sapporo = app.exports.computeEstimate();
  app.elements.residence.value = "metro";
  const metro = app.exports.computeEstimate();
  app.elements.residence.value = "tokyo";
  const tokyo = app.exports.computeEstimate();

  assert.ok(hokkaido.finalCount > sapporo.finalCount, "北海道 should be larger than 札幌市");
  assert.ok(metro.finalCount > tokyo.finalCount, "首都圏 should be larger than 東京都内");
});

test("income threshold rates are monotonic for every gender region and age", () => {
  const app = loadApp();
  const thresholds = ["200万+", "300万+", "400万+", "500万+", "600万+", "700万+", "800万+", "1000万+"];

  for (const [gender, regions] of Object.entries(app.exports.INCOME_DISTRIBUTION)) {
    for (const [region, ages] of Object.entries(regions)) {
      for (const [age, values] of Object.entries(ages)) {
        for (let i = 1; i < thresholds.length; i += 1) {
          const previous = values[thresholds[i - 1]];
          const current = values[thresholds[i]];
          assert.ok(
            previous >= current,
            `${gender}/${region}/${age} should be monotonic at ${thresholds[i]}`
          );
        }
      }
    }
  }
});

test("distribution JSON files match HTML constants", () => {
  const app = loadApp();
  const income = JSON.parse(fs.readFileSync(new URL("./income_distribution.json", import.meta.url), "utf8"));
  const marital = JSON.parse(fs.readFileSync(new URL("./marital_distribution.json", import.meta.url), "utf8"));
  const nationality = JSON.parse(fs.readFileSync(new URL("./nationality_distribution.json", import.meta.url), "utf8"));

  assert.deepEqual(income, JSON.parse(JSON.stringify(app.exports.INCOME_DISTRIBUTION)));
  assert.deepEqual(marital, JSON.parse(JSON.stringify(app.exports.MARITAL_DISTRIBUTION)));
  assert.deepEqual(nationality, JSON.parse(JSON.stringify(app.exports.NATIONALITY_RATES)));
});

let failed = 0;

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error.stack);
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`PASS ${tests.length} tests`);
}
