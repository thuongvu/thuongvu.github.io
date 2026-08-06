# Local-only helper for Ruby 3.2+/4.x + Jekyll 3.9 (github-pages).
# Load with: RUBYOPT="-r$PWD/_plugins/ruby4_compat" bundle exec jekyll serve
# GitHub Pages ignores _plugins and runs an older Ruby, so production is unaffected.
class Object
  def tainted?
    false
  end

  def taint
    self
  end

  def untaint
    self
  end
end unless Object.method_defined?(:tainted?)
