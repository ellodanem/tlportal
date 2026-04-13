<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## TL Portal — project context

After commits or pushes, maintain **`PROJECT_CONTEXT.md`** per **`.cursor/rules/project-context-log.mdc`**. Run **`npm run hooks:install`** once per clone so `.githooks` append to that file automatically.

## Responsive layout (mobile-friendly)

TL Portal is used on phones as well as desktops. When adding or changing UI—especially admin shells, nav, tables, and forms—**keep narrow viewports in mind**: avoid layouts where a fixed sidebar and main column stay side-by-side on small screens and squeeze content. Prefer collapsible or overlay navigation, full-width main content below `md` (or similar), readable line lengths, and adequate tap targets. It does not need to be perfect on every breakpoint, but new work should not assume desktop-only.
