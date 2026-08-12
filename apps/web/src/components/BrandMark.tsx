// Mirrors the mark in docs/assets/openkartline-logo.svg so the site and the
// README show the same brand. The viewBox is inset by 2 units because the
// rounded square is stroked and would otherwise clip at the edges.
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="-2 -2 124 124"
      fill="none"
      aria-hidden="true"
    >
      <rect width="120" height="120" rx="30" fill="#0d1b15" stroke="#315a47" strokeWidth="3" />
      <path
        d="M24 87 C44 77 53 63 73 53 C89 45 98 37 105 25"
        stroke="#34c982"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M20 101 C47 91 60 75 80 65 C94 58 103 50 109 42"
        stroke="#6ee7aa"
        strokeWidth="5"
        strokeLinecap="round"
        opacity=".9"
      />
      <path
        d="M20 69 C37 60 50 47 68 38 C80 32 89 25 96 18"
        stroke="#248f61"
        strokeWidth="5"
        strokeLinecap="round"
        opacity=".8"
      />
    </svg>
  )
}
