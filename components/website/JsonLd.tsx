// Renders a schema.org JSON-LD block. `<` is escaped so a value containing "</script>" cannot break out.
import React from 'react';

export default function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
