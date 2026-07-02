// S1 플레이스홀더 — 빌더 UI는 S3에서 구현.
// catalog.json이 올바르게 빌드되어 로드되는지만 콘솔로 확인.
import catalog from './data/catalog.json';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  const gobangCount = catalog.properties.gobang.events.length;
  const uceoCount = catalog.properties.uceo.events.length;
  app.textContent = `BQ 쿼리 빌더 스캐폴드 — 카탈로그 로드됨 (고방 ${gobangCount}개 · U사장님 ${uceoCount}개 이벤트). UI는 S3에서 구현됩니다.`;
}
