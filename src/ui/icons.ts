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

export const alertTriangleIcon = base(
  '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>' +
    '<path d="M12 9v4"/><path d="M12 17h.01"/>',
);

export const copyIcon = base(
  '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
);

export const checkIcon = base('<path d="M20 6 9 17l-5-5"/>');
