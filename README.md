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

## License

Apache-2.0. See [LICENSE](LICENSE).
