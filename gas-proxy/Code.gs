/**
 * BQ 쿼리빌더 — Gemini SQL 생성 프록시.
 *
 * 자연어 질문 + (클라이언트가 트림한) 스키마 → Gemini 2.5 Flash → 검증된 BigQuery SQL 텍스트.
 * ⚠️ 이 프록시는 BigQuery에 쿼리를 실행하지 않는다. 산출물은 SQL 텍스트뿐이며, 실행은 사람이 BQ 콘솔에서 한다.
 *
 * Script Properties (사용자 주입):
 *   GEMINI_API_KEY  — Gemini API 키 (필수)
 *   ACCESS_KEY      — 클라이언트 게이트 키 (선택; 미설정 시 통과)
 */

var MODEL = 'gemini-2.5-flash';
var GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent';
var PROJECT_ID = 'gobang-bigquery';
var ALLOWED_DATASETS = ['analytics_274122040', 'analytics_279311003'];

// ---- 비용 하드캡 (절대 1000원 초과 불가하도록 보수적으로 900원에서 차단) ----
var MONTHLY_BUDGET_KRW = 900;
var USD_KRW = 1400; // 보수적 환율(높게 잡아 과소추정 방지)
var PRICE_IN_PER_M = 0.3; // gemini-2.5-flash 입력 $/1M tokens
var PRICE_OUT_PER_M = 2.5; // 출력 $/1M tokens
var CACHE_TTL_SEC = 21600; // 동일 질문 6시간 캐시 → LLM 재호출 0

var INSTRUCTIONS = [
  '당신은 GA4 raw export(BigQuery)용 SQL 생성기다. 자연어 질문을 BigQuery Standard SQL로 변환한다.',
  '',
  '## 절대 규칙',
  '- 반드시 SELECT 또는 WITH 로 시작하는 읽기 전용 쿼리만. INSERT/UPDATE/DELETE/DROP/CREATE/MERGE/ALTER 금지.',
  '- FROM 은 항상 `gobang-bigquery.<datasetId>.events_*` 와일드카드 테이블.',
  '- 기간은 반드시 _TABLE_SUFFIX BETWEEN \'YYYYMMDD\' AND \'YYYYMMDD\' 로 제한한다(비용 안전, 예외 없음).',
  '- 아래 "사용 가능한 이벤트/파라미터" 목록에 있는 event_name·파라미터 key 만 사용한다. 목록 밖 이름을 지어내지 마라.',
  '',
  '## 서식 규칙',
  '- WITH base AS (...) 형태로 원천을 먼저 평탄화한다.',
  '- event_date 는 PARSE_DATE(\'%Y%m%d\', event_date) 로 변환해 쓴다.',
  '- 파라미터 추출: (SELECT value.string_value FROM UNNEST(event_params) WHERE key = \'파람키\') 형태.',
  '  값 타입에 맞춰 string_value/int_value/double_value 를 고른다. 숫자 캐스팅은 SAFE_CAST 사용.',
  '- NULL 안전: 필요 시 COALESCE 로 감싼다.',
  '- branch_type 을 쓸 때 원룸텔·고시원 은 CASE 로 "고시원·원룸텔" 한 그룹으로 병합한다.',
  '- CTR/비율은 SAFE_DIVIDE(clicks, views) 로 계산한다(0 나눗셈 방지).',
  '- 서로 다른 이벤트의 파라미터 값을 한 행에서 이어붙이지 마라(dataLayer 상속 구조상 스티칭 불가).',
  '',
  '## 가독성(반드시 지킬 것) — 사람이 그대로 읽고 편집할 SQL이다',
  '- 절대 한 줄로 압축하지 마라. 여러 줄로 펼치고 2칸 스페이스로 들여쓴다.',
  '- WITH / SELECT / FROM / WHERE / GROUP BY / ORDER BY 등 주요 절은 각각 새 줄에서 시작한다.',
  '- SELECT 의 컬럼(표현식)은 한 줄에 하나씩 쓰고 2칸 들여쓴다.',
  '- 논리 구획마다 /* ===== 섹션명 ===== */ 주석 블록을 넣는다.',
  '- 각 컬럼·필터·집계 표현식 위 또는 옆에 무엇을 구하는지 한국어 주석을 단다(예: 조회수, 클릭수, 클릭률).',
  '- 아래 예시와 같은 형태로 출력한다(들여쓰기·주석·줄바꿈 스타일을 따른다):',
  'WITH base AS (',
  '  SELECT',
  '    event_date,',
  '    event_name,',
  '',
  '    /* ===== event_params: 광고 배너 위치 ===== */',
  '    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = \'ad_banner_position\') AS ad_banner_position',
  '  FROM',
  '    `gobang-bigquery.<datasetId>.events_*`',
  '  WHERE',
  '    /* ===== 조회 기간 ===== */',
  '    _TABLE_SUFFIX BETWEEN \'20230101\' AND \'20230107\'',
  '    /* ===== 대상 이벤트 ===== */',
  '    AND event_name IN (\'ad_banner_view\', \'ad_banner_click\')',
  ')',
  '',
  'SELECT',
  '  /* ===== 날짜 ===== */',
  '  PARSE_DATE(\'%Y%m%d\', event_date) AS event_date,',
  '  /* ===== 배너 위치 (없으면 N/A) ===== */',
  '  COALESCE(ad_banner_position, \'N/A\') AS ad_banner_position,',
  '  /* ===== 조회수 ===== */',
  '  COUNTIF(event_name = \'ad_banner_view\') AS views,',
  '  /* ===== 클릭수 ===== */',
  '  COUNTIF(event_name = \'ad_banner_click\') AS clicks,',
  '  /* ===== 클릭률 = 클릭수 ÷ 조회수 ===== */',
  '  SAFE_DIVIDE(',
  '    COUNTIF(event_name = \'ad_banner_click\'),',
  '    COUNTIF(event_name = \'ad_banner_view\')',
  '  ) AS ctr',
  'FROM base',
  '/* ===== 날짜·배너 위치별 집계 ===== */',
  'GROUP BY event_date, ad_banner_position',
  '/* ===== 정렬 ===== */',
  'ORDER BY event_date, ad_banner_position',
  '',
  '## 출력',
  '- JSON 객체 { "sql": "...", "explanation": "..." } 만 반환한다.',
  '- explanation 은 이 SQL이 무엇을 구하는지 한국어 한 줄 요약.',
].join('\n');

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!checkAccess(body.accessKey)) return json({ ok: false, error: '접근이 거부되었습니다.' });

    var question = String(body.question || '').trim();
    if (!question) return json({ ok: false, error: '질문이 비어 있습니다.' });

    var property = body.property; // { datasetId, label }
    if (!property || ALLOWED_DATASETS.indexOf(property.datasetId) < 0) {
      return json({ ok: false, error: '허용되지 않은 데이터셋입니다.' });
    }
    var schema = body.schema || { events: [] };
    var history = Array.isArray(body.history) ? body.history : [];

    return json(generateWithGuard(question, property, schema, history));
  } catch (err) {
    return json({ ok: false, error: '프록시 오류: ' + errMsg(err) });
  }
}

// 헬스체크용(GET).
function doGet() {
  return json({
    ok: true,
    service: 'bq-query-builder gemini proxy',
    model: MODEL,
    budget: budgetInfo(),
  });
}

function checkAccess(key) {
  var expected = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
  if (!expected) return true; // 미설정 시 통과. 배포 시 설정 권장.
  return key === expected;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function errMsg(err) {
  return err && err.message ? err.message : String(err);
}

// ---- 비용 하드캡 헬퍼 ----
function monthKey() {
  return 'COST_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMM');
}
function getSpentKrw() {
  var p = PropertiesService.getScriptProperties().getProperty(monthKey());
  return p ? Number(p) : 0;
}
function addSpentKrw(delta) {
  var props = PropertiesService.getScriptProperties();
  var next = getSpentKrw() + delta;
  props.setProperty(monthKey(), String(next));
  return next;
}
function costKrw(usage) {
  var inTok = (usage && usage.promptTokenCount) || 0;
  var outTok = (usage && usage.candidatesTokenCount) || 0;
  return (inTok / 1e6) * PRICE_IN_PER_M * USD_KRW + (outTok / 1e6) * PRICE_OUT_PER_M * USD_KRW;
}
function budgetInfo() {
  return { spentKrw: Math.round(getSpentKrw()), capKrw: MONTHLY_BUDGET_KRW };
}
function cacheKeyFor(question, property, history) {
  var raw =
    property.datasetId + '|' + question + '|' + JSON.stringify((history || []).slice(-3));
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw, Utilities.Charset.UTF_8);
  return 'sql_' + Utilities.base64EncodeWebSafe(digest);
}

// ---- 생성 + 예산가드 + 캐시 + 가드 + 자가수정 1회 ----
function generateWithGuard(question, property, schema, history) {
  // 0) 예산 하드캡 — 도달 시 LLM 호출 자체를 막는다(절대 초과 불가).
  if (getSpentKrw() >= MONTHLY_BUDGET_KRW) {
    return {
      ok: false,
      budgetExceeded: true,
      error: '이번 달 AI 사용 한도(₩' + MONTHLY_BUDGET_KRW + ')에 도달했습니다. 셀렉형으로 조립하세요.',
      budget: budgetInfo(),
    };
  }

  // 1) 캐시 — 동일 질문이면 LLM 미호출(비용 0).
  var cache = CacheService.getScriptCache();
  var ck = cacheKeyFor(question, property, history);
  var hit = cache.get(ck);
  if (hit) {
    var cached = JSON.parse(hit);
    cached.cached = true;
    cached.budget = budgetInfo();
    return cached;
  }

  // 2) 1차 생성.
  var gen = callGemini(buildPrompt(question, property, schema, history, null));
  if (gen.usage) addSpentKrw(costKrw(gen.usage));
  if (!gen.ok) return withBudget(gen);

  var v = validateSql(gen.sql, property, schema);
  if (v.ok) {
    var ok1 = { ok: true, sql: gen.sql, explanation: gen.explanation, corrected: false };
    cache.put(ck, JSON.stringify(ok1), CACHE_TTL_SEC);
    return withBudget(ok1);
  }

  // 3) 자가수정 1회 — 예산 재확인 후에만.
  if (getSpentKrw() >= MONTHLY_BUDGET_KRW) {
    return {
      ok: false,
      budgetExceeded: true,
      error: '한도 도달로 자가수정을 중단했습니다.',
      sql: gen.sql,
      budget: budgetInfo(),
    };
  }
  var gen2 = callGemini(buildPrompt(question, property, schema, history, v.error));
  if (gen2.usage) addSpentKrw(costKrw(gen2.usage));
  if (!gen2.ok) return withBudget(gen2);

  var v2 = validateSql(gen2.sql, property, schema);
  if (v2.ok) {
    var ok2 = { ok: true, sql: gen2.sql, explanation: gen2.explanation, corrected: true };
    cache.put(ck, JSON.stringify(ok2), CACHE_TTL_SEC);
    return withBudget(ok2);
  }

  return withBudget({
    ok: false,
    error: '생성된 SQL이 검증을 통과하지 못했습니다: ' + v2.error,
    sql: gen2.sql,
  });
}

function withBudget(obj) {
  obj.budget = budgetInfo();
  return obj;
}

function buildPrompt(question, property, schema, history, errorFeedback) {
  var lines = [];
  lines.push(INSTRUCTIONS);
  lines.push('');
  lines.push('## 대상');
  lines.push('데이터셋: ' + property.datasetId + ' (' + (property.label || '') + ')');
  lines.push('테이블: `' + PROJECT_ID + '.' + property.datasetId + '.events_*`');
  lines.push('');
  lines.push('## 사용 가능한 이벤트/파라미터 (이 목록 밖은 금지)');
  lines.push(renderSchema(schema));

  if (history.length) {
    lines.push('');
    lines.push('## 직전 대화(맥락 — 후속 질문이면 이어서 해석)');
    history.slice(-3).forEach(function (h) {
      if (h && h.question) lines.push('이전 질문: ' + h.question);
      if (h && h.sql) lines.push('이전 SQL:\n' + h.sql);
    });
  }

  lines.push('');
  lines.push('## 질문');
  lines.push(question);

  if (errorFeedback) {
    lines.push('');
    lines.push('## 직전 생성 SQL이 아래 이유로 거부됨 — 반드시 고쳐 다시 생성');
    lines.push(errorFeedback);
  }
  return lines.join('\n');
}

function renderSchema(schema) {
  var events = (schema && schema.events) || [];
  if (!events.length) return '(스키마 없음)';
  return events
    .map(function (ev) {
      var params = (ev.params || [])
        .map(function (p) {
          return p.key + '(' + p.type + ')';
        })
        .join(', ');
      return '- ' + ev.name + (params ? ' — ' + params : '');
    })
    .join('\n');
}

// ---- Gemini 호출 ----
function callGemini(prompt) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, error: 'GEMINI_API_KEY 가 설정되지 않았습니다(Script Property).' };

  var payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          sql: { type: 'STRING' },
          explanation: { type: 'STRING' },
        },
        required: ['sql', 'explanation'],
      },
    },
  };

  var res = UrlFetchApp.fetch(GEMINI_URL + '?key=' + encodeURIComponent(key), {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code !== 200) {
    return { ok: false, error: 'Gemini 오류(' + code + '): ' + text.slice(0, 300) };
  }

  var data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'Gemini 응답 파싱 실패' };
  }

  var cand =
    data.candidates && data.candidates[0] && data.candidates[0].content
      ? data.candidates[0].content
      : null;
  var out = cand && cand.parts && cand.parts[0] ? cand.parts[0].text : '';
  if (!out) return { ok: false, error: 'Gemini 빈 응답' };

  var parsed;
  try {
    parsed = JSON.parse(out);
  } catch (e) {
    return { ok: false, error: 'Gemini SQL JSON 파싱 실패', usage: data.usageMetadata };
  }
  return {
    ok: true,
    sql: String(parsed.sql || '').trim(),
    explanation: String(parsed.explanation || ''),
    usage: data.usageMetadata,
  };
}

// ---- 출력가드 (읽기전용·비용·스키마) ----
function validateSql(sql, property, schema) {
  if (!sql) return { ok: false, error: 'SQL 이 비어 있습니다.' };

  var upper = sql.toUpperCase();
  var head = upper.replace(/^[\s(]+/, '');
  if (head.indexOf('SELECT') !== 0 && head.indexOf('WITH') !== 0) {
    return { ok: false, error: 'SELECT 또는 WITH 로 시작하는 읽기 전용 쿼리여야 합니다.' };
  }

  if (/\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|MERGE|TRUNCATE|GRANT|REVOKE)\b/.test(upper)) {
    return { ok: false, error: '쓰기/DDL 키워드가 포함되어 있습니다(읽기 전용만 허용).' };
  }

  if (upper.indexOf('_TABLE_SUFFIX') < 0) {
    return {
      ok: false,
      error: '기간 제한이 없습니다. 반드시 _TABLE_SUFFIX BETWEEN 로 기간을 제한하세요(비용 안전).',
    };
  }

  if (sql.indexOf(property.datasetId) < 0) {
    return { ok: false, error: '대상 데이터셋 ' + property.datasetId + ' 을(를) 참조하지 않습니다.' };
  }
  for (var i = 0; i < ALLOWED_DATASETS.length; i++) {
    var other = ALLOWED_DATASETS[i];
    if (other !== property.datasetId && sql.indexOf(other) >= 0) {
      return { ok: false, error: '다른 프로퍼티 데이터셋(' + other + ')을 교차 참조할 수 없습니다.' };
    }
  }

  var schemaErr = validateAgainstSchema(sql, schema);
  if (schemaErr) return { ok: false, error: schemaErr };

  return { ok: true };
}

// SQL이 참조한 event_name / 파라미터 key 가 스키마에 실재하는지 검증(환각 차단).
function validateAgainstSchema(sql, schema) {
  var events = (schema && schema.events) || [];
  if (!events.length) return null; // 스키마 없으면 스킵.

  var validEvents = {};
  var validParams = {};
  events.forEach(function (ev) {
    validEvents[ev.name] = true;
    (ev.params || []).forEach(function (p) {
      validParams[p.key] = true;
    });
  });

  // event_name = 'x' / event_name IN ('a','b')
  var unknownEvents = [];
  var reEq = /EVENT_NAME\s*=\s*'([^']+)'/gi;
  var m;
  while ((m = reEq.exec(sql)) !== null) {
    if (!validEvents[m[1]]) unknownEvents.push(m[1]);
  }
  var reIn = /EVENT_NAME\s+IN\s*\(([^)]*)\)/gi;
  while ((m = reIn.exec(sql)) !== null) {
    var names = m[1].match(/'([^']+)'/g) || [];
    names.forEach(function (raw) {
      var name = raw.replace(/'/g, '');
      if (!validEvents[name]) unknownEvents.push(name);
    });
  }
  if (unknownEvents.length) {
    return '존재하지 않는 event_name: ' + uniq(unknownEvents).join(', ');
  }

  // UNNEST(event_params) ... WHERE key = 'x'
  var unknownKeys = [];
  var reKey = /KEY\s*=\s*'([^']+)'/gi;
  while ((m = reKey.exec(sql)) !== null) {
    if (!validParams[m[1]]) unknownKeys.push(m[1]);
  }
  if (unknownKeys.length) {
    return '존재하지 않는 파라미터 key: ' + uniq(unknownKeys).join(', ');
  }
  return null;
}

function uniq(arr) {
  var seen = {};
  var out = [];
  arr.forEach(function (x) {
    if (!seen[x]) {
      seen[x] = true;
      out.push(x);
    }
  });
  return out;
}
