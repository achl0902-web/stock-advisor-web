export function readGithubConfig() {
  try {
    let t = JSON.parse(localStorage.getItem("sa:settings") || "null");
    return t?.token && t?.owner && t?.repo ? t : null;
  } catch {
    return null;
  }
}
export class GithubBoardError extends Error {
  status;
  constructor(t, e) {
    super(e);
    this.status = t;
  }
}
export class GithubBoard {
  cfg;
  head = null;
  files = new Map();
  blobs = new Map();
  constructor(config, { now = () => Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    this.cfg = config;
    this.now = now;
    this.sleep = sleep;
  }
  async req(t, e = "application/vnd.github+json", n = {}) {
    let i;
    try {
      i = await fetch("https://api.github.com" + t, {
        ...n,
        headers: {
          Authorization: `Bearer ${this.cfg.token}`,
          Accept: e,
          ...(n.body ? { "Content-Type": "application/json" } : {}),
        },
        cache: "no-store",
      });
    } catch {
      throw new GithubBoardError(
        0,
        "GitHub에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.",
      );
    }
    if (i.status === 401)
      throw new GithubBoardError(
        401,
        "토큰이 맞지 않거나 만료됐어요. 판단 일지 설정에서 새 토큰을 넣어 주세요.",
      );
    if (i.status === 403 && i.headers.get("x-ratelimit-remaining") === "0")
      throw new GithubBoardError(
        403,
        "GitHub 요청 한도에 걸렸어요. 잠시 뒤 다시 열어 주세요.",
      );
    if (i.status === 404 || i.status === 403)
      throw new GithubBoardError(
        i.status,
        "시세 데이터(board-data 브랜치)를 읽지 못했어요. 토큰에 stock-advisor 읽기 권한이 있는지 확인해 주세요.",
      );
    if (!i.ok)
      throw new GithubBoardError(i.status, `GitHub 응답 오류 (${i.status})`);
    if (i.status === 204) return null;
    return e.includes("raw") ? i.text() : i.json();
  }
  async refresh() {
    let t = `/repos/${this.cfg.owner}/${this.cfg.repo}`,
      e = await this.req(`${t}/branches/board-data`);
    if (e.commit.sha === this.head) return !1;
    let n = await this.req(`${t}/git/trees/${e.commit.sha}`);
    return (
      (this.files = new Map(
        n.tree.filter((i) => i.type === "blob").map((i) => [i.path, i.sha]),
      )),
      (this.head = e.commit.sha),
      !0
    );
  }
  async collecting() {
    let t = `/repos/${this.cfg.owner}/${this.cfg.repo}/actions/workflows/board.yml/runs`;
    for (let e of ["in_progress", "queued"])
      if ((await this.req(`${t}?status=${e}&per_page=1`)).total_count > 0)
        return !0;
    return !1;
  }
  async collect(t, e = 300000) {
    let n = this.head,
      s = (await this.json("market", "snapshot"))?.asof,
      i = !1;
    try {
      i = await this.collecting();
    } catch {}
    if (!i)
      try {
        await this.req(
          `/repos/${this.cfg.owner}/${this.cfg.repo}/actions/workflows/board.yml/dispatches`,
          "application/vnd.github+json",
          { method: "POST", body: JSON.stringify({ ref: "main" }) },
        );
      } catch (o) {
        let r = o.status;
        if (r === 403 || r === 404)
          throw new GithubBoardError(
            r,
            "토큰에 Actions 쓰기 권한이 없어 새로 수집하지 못했어요. GitHub 토큰 설정에서 Actions: Read and write를 켜 주세요.",
          );
        throw o;
      }
    let a = this.now();
    while (this.now() - a < e) {
      await this.sleep(3000);
      t(Math.round((this.now() - a) / 1000));
      if (
        (
          await this.req(
            `/repos/${this.cfg.owner}/${this.cfg.repo}/branches/board-data`,
          )
        ).commit.sha !== n
      ) {
        await this.refresh();
        let o = await this.json("market", "snapshot");
        if (o?.asof !== s) return !0;
        n = this.head;
      }
    }
    throw new GithubBoardError(
      0,
      "수집이 5분 안에 끝나지 않았어요. 잠시 뒤 다시 불러와 주세요.",
    );
  }
  json(t, e) {
    let n = this.files.get(`${t}--${e}.json`);
    if (!n) return Promise.resolve(null);
    let i = this.blobs.get(n);
    if (!i)
      ((i = this.req(
        `/repos/${this.cfg.owner}/${this.cfg.repo}/git/blobs/${n}`,
        "application/vnd.github.raw+json",
      ).then((a) => JSON.parse(a))),
        i.catch(() => this.blobs.delete(n)),
        this.blobs.set(n, i));
    return i;
  }
}
