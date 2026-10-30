# Contributing

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
for new commits and pull request titles:

```text
<type>[optional scope][!]: <short description>
```

Choose the type that describes the change:

| Prefix | Use for |
| --- | --- |
| `fix:` | Correcting a bug in existing behavior or styling |
| `feat:` | Adding a user-facing feature |
| `docs:` | Documentation-only changes |
| `style:` | Source formatting only, with no behavior change |
| `refactor:` | Restructuring code without fixing a bug or adding a feature |
| `perf:` | Improving performance |
| `test:` | Adding or correcting tests |
| `build:` | Build tooling or dependency changes |
| `ci:` | CI configuration changes |
| `chore:` | Maintenance not covered by the other types |
| `revert:` | Reverting an earlier change; identify it in the body |

A visual CSS correction is a `fix:`, not `style:`. The `style:` type is for
formatting, such as whitespace, rather than changing how Varnish looks.
Scopes are optional; use a concise area such as `settings`, `composer`, or
`palette` when it adds useful context. Keep descriptions specific and use the
imperative mood, without a trailing period.

Examples:

```text
fix(settings): remove duplicate sidebar decoration
feat(palette): add a session navigation action
docs: document commit message conventions
test(composer): cover the compact loading state
```

For an intentionally breaking change, add `!` after the type or scope and
explain the impact and migration in a `BREAKING CHANGE:` footer. Do not use a
breaking-change marker for an ordinary bug fix.

This convention applies prospectively; do not rewrite existing history to
rename old commits. It is contributor guidance, not an installed commit hook,
CI check, automatic release rule, or permission to change repository workflows.
Pull request titles follow the same convention so they remain suitable if an
owner chooses to squash a change. Repository review and approval requirements
still apply.
