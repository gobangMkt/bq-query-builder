// Lucide 아이콘 인라인 SVG. 이모지 금지 규칙 준수. stroke 1.5px 통일.

const base = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ` +
  `fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" ` +
  `stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const lockIcon = base(
  '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
);

export const searchIcon = base(
  '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
);

export const alertCircleIcon = base(
  '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
);

export const plusIcon = base('<path d="M12 5v14"/><path d="M5 12h14"/>');

export const trashIcon = base(
  '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
    '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
    '<path d="M10 11v6"/><path d="M14 11v6"/>',
);
