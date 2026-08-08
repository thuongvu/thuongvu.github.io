# thuongvu.github.io

Personal site for [thuongvuho.com](https://thuongvuho.com), built with Jekyll on GitHub Pages.

## Structure

- `index.md` — home
- `about.md` — about
- `writing.md` — writing index
- `_posts/YYYY-MM-DD-slug.md` — posts
- `assets/posts/<slug>/` — images and SVGs for a post
- `assets/css/main.css` — styles

### Adding a post with assets

1. Create `_posts/2026-08-08-my-post.md`
2. Put figures in `assets/posts/my-post/` (e.g. `diagram.svg`)
3. Reference them in the post:

```md
<figure class="wide">
  <img src="{{ '/assets/posts/my-post/diagram.svg' | relative_url }}" alt="Description of the diagram">
  <figcaption>Optional caption.</figcaption>
</figure>
```

Or a simple image:

```md
![Description]({{ '/assets/posts/my-post/diagram.svg' | relative_url }})
```

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
