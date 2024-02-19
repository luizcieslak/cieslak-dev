const defaultTheme = require('tailwindcss/defaultTheme')

module.exports = {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
	darkMode: 'class',
	theme: {
		fontFamily: {
			sans: ['Noto Sans Variable', ...defaultTheme.fontFamily.sans],
			serif: ['Zilla Slab', ...defaultTheme.fontFamily.serif],
		},
		extend: {
			textColor: {
				main: 'var(--color-text-main)',
			},
			backgroundColor: {
				main: 'var(--color-bg-main)',
				muted: 'var(--color-bg-muted)',
			},
			borderColor: {
				main: 'var(--color-border-main)',
			},
			typography: theme => ({
				dante: {
					css: {
						'--tw-prose-body': theme('textColor.main / 100%'),
						'--tw-prose-headings': theme('textColor.main / 100%'),
						'--tw-prose-lead': theme('textColor.main / 100%'),
						'--tw-prose-links': theme('textColor.main / 100%'),
						'--tw-prose-bold': theme('textColor.main / 100%'),
						'--tw-prose-counters': theme('textColor.main / 100%'),
						'--tw-prose-bullets': theme('textColor.main / 100%'),
						'--tw-prose-hr': theme('borderColor.main / 100%'),
						'--tw-prose-quotes': theme('textColor.main / 100%'),
						'--tw-prose-quote-borders': theme('borderColor.main / 100%'),
						'--tw-prose-captions': theme('textColor.main / 100%'),
						'--tw-prose-code': theme('textColor.main / 100%'),
						'--tw-prose-pre-code': theme('colors.zinc.100'),
						'--tw-prose-pre-bg': theme('colors.zinc.800'),
						'--tw-prose-th-borders': theme('borderColor.main / 100%'),
						'--tw-prose-td-borders': theme('borderColor.main / 100%'),
					},
				},
				DEFAULT: {
					css: {
						a: {
							fontWeight: 'normal',
							textDecoration: 'underline',
							textDecorationStyle: 'dashed',
							textDecorationThickness: '1px',
							textUnderlineOffset: '2px',
							'&:hover': {
								textDecorationStyle: 'solid',
							},
						},
						'h1,h2,h3,h4,h5,h6': {
							fontFamily: theme('fontFamily.serif'),
							fontWeight: 500,
						},
						blockquote: {
							border: 0,
							fontFamily: theme('fontFamily.serif'),
							fontSize: '1.3125em',
							fontStyle: 'italic',
							fontWeight: 'normal',
							lineHeight: 1.4,
							paddingLeft: 0,
							'@media (min-width: theme("screens.sm"))': {
								fontSize: '1.66667em',
								lineHeight: 1.3,
							},
						},
					},
				},
				lg: {
					css: {
						blockquote: {
							paddingLeft: 0,
						},
					},
				},
			}),
		},
	},
	plugins: [require('@tailwindcss/typography')],
}
