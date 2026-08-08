export default function Home() {
  return (
    <main style={{ padding: 32, maxWidth: 640 }}>
      <h1 style={{ marginBottom: 8 }}>Grok FDE — Intelligence Engine</h1>
      <p style={{ color: "#444", lineHeight: 1.5 }}>
        Part B server is running. Person A owns the product UI. Hit{" "}
        <code>/api/health</code> or follow <code>docs/test-requests.md</code>.
      </p>
    </main>
  );
}
