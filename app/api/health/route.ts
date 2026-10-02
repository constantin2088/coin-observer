export function GET() {
  return Response.json({ app: 'coin-observer', version: '1.1.0', ready: true });
}
