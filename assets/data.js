// 비공개 stock-advisor 저장소를 GitHub REST API로 읽는다.
// 토큰은 이 기기 브라우저(localStorage)에만 두고 api.github.com 말고는 어디에도 보내지 않는다.
// 파일 내용은 blob sha 기준으로 캐시한다. sha가 같으면 내용도 같으므로 다시 받지 않는다.
// 큰 JSON(brief·final_decision)은 화면에 쓰는 부분만 추려 캐시한다. 통째로 넣으면 localStorage 한도(약 5MB)를 넘겨 캐시가 매번 비워진다.

const API = "https://api.github.com";
const CACHE_PREFIX = "sa:b2:";
// 예전 캐시(원문 통째 저장)는 한 번 지운다
try { Object.keys(localStorage).filter(k => k.startsWith("sa:blob:")).forEach(k => localStorage.removeItem(k)); } catch { /* 무시 */ }
const MAX_CACHE_BYTES = 400_000; // 한 파일이 이보다 크면 캐시하지 않는다

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const settings = {
  load() {
    try { return JSON.parse(localStorage.getItem("sa:settings") || "null"); } catch { return null; }
  },
  save(v) {
    try { localStorage.setItem("sa:settings", JSON.stringify(v)); } catch { /* 저장소가 막힌 브라우저 */ }
  },
  clear() {
    try {
      localStorage.removeItem("sa:settings");
      Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).forEach(k => localStorage.removeItem(k));
    } catch { /* 무시 */ }
  },
};

function cacheGet(sha) {
  try { return localStorage.getItem(CACHE_PREFIX + sha); } catch { return null; }
}
function cachePut(sha, text) {
  if (text.length > MAX_CACHE_BYTES) return;
  try { localStorage.setItem(CACHE_PREFIX + sha, text); }
  catch {
    // 용량이 차면 캐시를 비우고 한 번만 다시 시도
    try {
      Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).forEach(k => localStorage.removeItem(k));
      localStorage.setItem(CACHE_PREFIX + sha, text);
    } catch { /* 포기 */ }
  }
}

// 동시에 6개까지만 요청
function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, res, rej } = queue.shift();
    fn().then(res, rej).finally(() => { active--; next(); });
  };
  return fn => new Promise((res, rej) => { queue.push({ fn, res, rej }); next(); });
}

export class Repo {
  constructor({ owner, repo, token }) {
    this.owner = owner;
    this.repo = repo;
    this.token = token;
    this.files = new Map();
    this.head = null;
    this.limit = limiter(6);
    this.inflight = new Map();
  }

  async req(path, accept = "application/vnd.github+json") {
    let r;
    try {
      r = await fetch(API + path, { headers: { Authorization: `Bearer ${this.token}`, Accept: accept }, cache: "no-store" });
    } catch {
      throw new ApiError(0, "GitHub에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
    }
    if (r.status === 401) throw new ApiError(401, "토큰이 맞지 않거나 만료됐습니다. 설정에서 새 토큰을 넣어 주세요.");
    if (r.status === 403 && r.headers.get("x-ratelimit-remaining") === "0") throw new ApiError(403, "GitHub 요청 한도에 걸렸습니다. 잠시 뒤 다시 열어 주세요.");
    if (r.status === 404 || r.status === 403) throw new ApiError(r.status, `${this.owner}/${this.repo} 저장소를 읽을 수 없습니다. 토큰에 이 저장소 Contents 읽기 권한이 있는지 확인해 주세요.`);
    if (!r.ok) throw new ApiError(r.status, `GitHub 응답 오류 (${r.status})`);
    return accept.includes("raw") ? r.text() : r.json();
  }

  async index() {
    const base = `/repos/${this.owner}/${this.repo}`;
    const [commit] = await this.req(`${base}/commits?per_page=1`);
    const tree = await this.req(`${base}/git/trees/${commit.sha}?recursive=1`);
    this.files.clear();
    this.boardTree = null;
    for (const e of tree.tree) if (e.type === "blob") this.files.set(e.path, { sha: e.sha, size: e.size });
    this.head = {
      sha: commit.sha,
      date: commit.commit.committer?.date || commit.commit.author?.date,
      message: commit.commit.message.split("\n")[0],
    };
    return this.head;
  }

  has(path) { return this.files.has(path); }

  list(prefix) {
    return [...this.files.keys()].filter(p => p.startsWith(prefix));
  }

  blob(sha) {
    if (this.inflight.has(sha)) return this.inflight.get(sha);
    const p = this.limit(() => this.req(`/repos/${this.owner}/${this.repo}/git/blobs/${sha}`, "application/vnd.github.raw+json"))
      .finally(() => this.inflight.delete(sha));
    this.inflight.set(sha, p);
    return p;
  }

  async text(path) {
    const f = this.files.get(path);
    if (!f) return null;
    const hit = cacheGet(f.sha);
    if (hit !== null) return hit;
    const t = await this.blob(f.sha);
    cachePut(f.sha, t);
    return t;
  }

  // tag·pick을 주면 pick(원본)의 결과만 캐시한다. pick을 고치면 tag도 바꿔야 옛 캐시를 안 쓴다.
  async json(path, tag, pick) {
    const f = this.files.get(path);
    if (!f) return null;
    return this.jsonBySha(f.sha, tag, pick);
  }

  async jsonBySha(sha, tag, pick) {
    const key = tag ? `${sha}~${tag}` : sha;
    try {
      const hit = cacheGet(key);
      if (hit !== null) return JSON.parse(hit);
      const t = await this.blob(sha);
      if (!tag) { cachePut(key, t); return JSON.parse(t); }
      const v = pick(JSON.parse(t));
      cachePut(key, JSON.stringify(v));
      return v;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      return null; // JSON이 깨진 파일
    }
  }

  // 시세판 수집(board-data 브랜치)의 파일 하나: 관심종목 현재가·환율(market--snapshot.json), 평가액 추이(networth--history.json).
  // 브랜치 목록은 index() 한 번에 한 번만 받는다. 브랜치가 없거나 못 읽으면 null.
  async board(file, tag, pick) {
    try {
      const base = `/repos/${this.owner}/${this.repo}`;
      this.boardTree ??= this.req(`${base}/branches/board-data`).then(br => this.req(`${base}/git/trees/${br.commit.sha}`));
      const f = (await this.boardTree).tree.find(e => e.path === file);
      return f ? await this.jsonBySha(f.sha, tag, pick) : null;
    } catch { return null; }
  }
}

// 공개 back-testing 저장소의 QLD 챔피언 전략 상태 (토큰 없이 읽음)
export async function fetchStrategyStatus() {
  try {
    const r = await fetch("https://raw.githubusercontent.com/achl0902-web/back-testing/main/qld/data/status.json", { cache: "no-store" });
    return r.ok ? r.json() : null;
  } catch { return null; }
}
