export function GET() {
  return Response.json({ app: 'coin-observer', version: 2, ready: true });
}
