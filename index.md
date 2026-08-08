---
layout: default
description: "A personal site about software engineering, distributed systems, and machine learning infrastructure."
---

<section class="home-hero">
  <h1>{{ site.title }}</h1>
  <p class="lede">
    Hi, I’m Thuongvu. I’m a software engineer. This is where I share some of the things I’m working on and learning.
  </p>
</section>

<section>
  <h2 class="section-label">Writing</h2>
  {% assign posts = site.posts %}
  {% if posts.size > 0 %}
  <ul class="post-list">
    {% for post in posts limit:5 %}
    <li>
      <a class="title" href="{{ post.url | relative_url }}">{{ post.title }}</a>
      <p class="meta">
        <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%B %-d, %Y" }}</time>
      </p>
    </li>
    {% endfor %}
  </ul>
  {% else %}
  <p class="empty-note">No posts yet. Check back soon, or browse <a href="{{ '/writing/' | relative_url }}">Writing</a>.</p>
  {% endif %}
</section>
