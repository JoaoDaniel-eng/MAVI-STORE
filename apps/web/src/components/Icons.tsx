type P = { filled?: boolean };
export const HeartIcon = ({ filled }: P) => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.6 5 6.7 5c1.9 0 3.5 1 5.3 3 1.8-2 3.4-3 5.3-3 3.1 0 5 3 3.9 6.2-1.7 4.7-9.2 9.3-9.2 9.3Z" />
  </svg>
);
export const FilterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M4 7h16M7 12h10M10 17h4" />
  </svg>
);
export const BagIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
);
