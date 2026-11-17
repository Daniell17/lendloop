export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="10" fill="#1c6b4a" />
      <path
        d="M10 16.5a6 6 0 0 1 10.2-4.2"
        fill="none"
        stroke="#f3efe6"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M22 15.5a6 6 0 0 1-10.2 4.2"
        fill="none"
        stroke="#f4c7a8"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M20.2 8.2 21.4 12.4 17.2 12" fill="none" stroke="#f3efe6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.8 23.8 10.6 19.6 14.8 20" fill="none" stroke="#f4c7a8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
