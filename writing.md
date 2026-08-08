---
layout: page
title: Writing
permalink: /writing/
subtitle: "Notes, write-ups, and project stories."
---

{% assign posts = site.posts %}
{% if posts.size > 0 %}
<ul class="post-list">
  {% for post in posts %}
  <li>
    <a class="title" href="{{ post.url | relative_url }}">{{ post.title }}</a>
    <p class="meta">
      <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%B %-d, %Y" }}</time>
    </p>
  </li>
  {% endfor %}
</ul>
{% else %}
<p class="empty-note">No posts yet. Add a Markdown file under <code>_posts/</code> as <code>YYYY-MM-DD-slug.md</code>.</p>
{% endif %}
