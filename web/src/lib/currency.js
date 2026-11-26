// 实时汇率先查 Frankfurter（欧洲央行等发布的参考汇率，免费、不需要 API key、支持跨域请求，
// 现在的地址是 https://api.frankfurter.dev，旧的 api.frankfurter.app 已经用不了），
// 查不到再用 jsDelivr 上的 currency-api 兜底。两个都查不到时，界面上可以手动填汇率。
export const HOME_CURRENCY = 'CAD';

// 常见币种，Frankfurter 都支持；CAD 放最前面作为默认选项。
export const CURRENCIES = [
  'CAD', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'HKD', 'CHF',
  'INR', 'KRW', 'MXN', 'SGD', 'NZD', 'SEK', 'NOK', 'THB', 'PHP',
];

const RATE_CACHE_PREFIX = 'fxrate:';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 隐私模式 / 存储被禁用时存不进去就算了，不影响当次汇率查询结果
  }
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 按顺序试，返回 1 from = ? to
const RATE_SOURCES = [
  async (from, to) => (await getJson(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`)).rates?.[to],
  async (from, to) => {
    const f = from.toLowerCase();
    const data = await getJson(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${f}.min.json`);
    return data[f]?.[to.toLowerCase()];
  },
];

/** 查询 from -> to 的实时汇率。汇率一天更新一次，同一天同一币种对只请求一次，缓存在 sessionStorage。 */
export async function fetchRate(from, to) {
  if (from === to) return 1;
  const cacheKey = `${RATE_CACHE_PREFIX}${from}:${to}:${todayKey()}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  for (const source of RATE_SOURCES) {
    try {
      const rate = Number(await source(from, to));
      if (rate > 0) {
        writeCache(cacheKey, rate);
        return rate;
      }
    } catch {
      // 这个来源不行就换下一个
    }
  }
  throw new Error(`查不到 ${from} → ${to} 的实时汇率`);
}

export function formatForeign(amount, currency) {
  return `${Number(amount).toFixed(2)} ${currency}`;
}

/** 一批币种 → CAD 的汇率表（CAD 自己是 1）；查不到的币种值为 null，调用方自己决定怎么处理。 */
export async function fetchRatesToHome(currencies) {
  const uniq = [...new Set(currencies.filter((c) => c && c !== HOME_CURRENCY))];
  const entries = await Promise.all(uniq.map(async (c) => {
    try {
      return [c, await fetchRate(c, HOME_CURRENCY)];
    } catch {
      return [c, null];
    }
  }));
  return Object.fromEntries([[HOME_CURRENCY, 1], ...entries]);
}

export const round2 = (n) => Math.round(n * 100) / 100;

/**
 * 某个账户币种下的一笔金额，转成写进 transactions 的字段：amount 永远是 CAD，
 * 非 CAD 账户额外记下原币金额、币种和汇率。
 */
export async function toStoredAmount(amountInCurrency, currency) {
  if (!currency || currency === HOME_CURRENCY) {
    return { amount: round2(amountInCurrency), currency: HOME_CURRENCY, original_amount: null, exchange_rate: null };
  }
  const rate = await fetchRate(currency, HOME_CURRENCY);
  return {
    amount: round2(amountInCurrency * rate),
    currency,
    original_amount: round2(amountInCurrency),
    exchange_rate: rate,
  };
}
