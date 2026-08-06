# thuongvu.github.io

Personal site for [thuongvuho.com](https://thuongvuho.com), built with Jekyll on GitHub Pages.

## Structure

- `index.md` — home
- `about.md` — about
- `_posts/` — add Writing later as `YYYY-MM-DD-slug.md`
- `assets/css/main.css` — styles
- `assets/images/` — images for posts

When you add your first post, restore a Writing link in `_includes/header.html` and a post list on `index.md` (or add `writing.md` again).

## Local preview (optional)

Homebrew Ruby 4 needs a small compat shim (Jekyll 3.9 / GitHub Pages):

```bash
export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
bundle install
RUBYOPT="-r$PWD/_plugins/ruby4_compat" bundle exec jekyll serve
```

Open http://localhost:4000

## Deploy

Push to the default branch. GitHub Pages builds Jekyll automatically.
Keep `CNAME` as `thuongvuho.com` for the custom domain.
