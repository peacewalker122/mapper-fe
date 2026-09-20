# mapper-fe

Frontend SDK for the Mapper platform: framework-neutral API client and
mapping core, plus a React mapping editor and demo screen.

```tsx
const client = createMapperClient({ baseUrl: "/mapper" });

<MapperImporter client={client} schemaId={SUBSCRIBER_SCHEMA} />
```

```bash
bun install
bun run test      # vitest
bun run typecheck # tsc --noEmit
```

Packages: `@mapper/client` (HTTP + protocol types) → `@mapper/core`
(mapping ops, validation, workflow state) → `@mapper/react` (editor,
importer, React Flow adapter) + `@mapper/upload` (multipart adapter).

The mapping UI edits a portable `MappingSpec` (`source` index → stable
target ID); the backend in
[mapper-be](https://github.com/peacewalker122/mapper-be) stays authoritative
for validation and execution.

## Releases

Create a changeset for each release-worthy change:

```bash
bun run changeset
```

Commit the changeset and merge it to `main`. Then open Actions → Release →
Run workflow to publish. This workflow runs only when manually dispatched; it
versions packages with `bun run version`, refreshes the lockfile, runs
typecheck and tests, publishes packages, commits generated package versions,
changelogs, consumed changesets, and lockfile updates to `main`, then pushes
release tags. Ordinary pushes to `main` do not publish.

`@mapper/client`, `@mapper/core`, `@mapper/react`, and `@mapper/upload` use
fixed versioning, so they release together. The initial changeset makes their
first public release `0.1.0`.

Publishing requires an `NPM_TOKEN` repository secret. The workflow uses its
`GITHUB_TOKEN` with `contents: write` to push the generated commit and tags;
it does not require pull-request creation or approval settings.

## License

Apache-2.0. See [LICENSE](LICENSE).
