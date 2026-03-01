# Componente do Widget para Microservice

Arquivo do componente:
- `/js/taiksu-widget-component.js`

Ele registra o Web Component `<taiksu-chat-widget>` e encapsula a chamada do `TaiksuChat.init(...)`.

## 1) Uso rapido (HTML)

```html
<script src="http://127.0.0.1:3000/js/taiksu-widget-component.js"></script>

<taiksu-chat-widget
  server-url="http://127.0.0.1:3000"
  client-app-id="meu-microservice"
  client-app-name="Meu Microservice"
  external-user-id="user-42"
  auth-token="SEU_TOKEN_JWT"
  user-name="Carol Cliente"
  title="Suporte Taiksu"
  auto-open="false"
  support-inbox="false"
></taiksu-chat-widget>
```

## 2) Uso em React

```jsx
import { useEffect } from "react";

export default function ChatEmbed() {
  useEffect(() => {
    const id = "taiksu-widget-component-script";
    if (document.getElementById(id)) return;
    const s = document.createElement("script");
    s.id = id;
    s.src = "http://127.0.0.1:3000/js/taiksu-widget-component.js";
    s.async = true;
    document.head.appendChild(s);
  }, []);

  return (
    <taiksu-chat-widget
      server-url="http://127.0.0.1:3000"
      client-app-id="meu-microservice"
      external-user-id="user-42"
      auth-token="SEU_TOKEN_JWT"
      auto-open="false"
    />
  );
}
```

## 3) Atributos suportados

- `server-url` (obrigatorio)
- `room-id` ou `client-app-id` (um dos dois)
- `client-app-name`
- `external-user-id`
- `user-id`
- `auth-token`
- `user-name`
- `title`
- `subtitle`
- `placeholder`
- `position` (`bottom-right` | `bottom-left`)
- `mode` (`inline` | `floating`) - padrao: `inline`
- `auto-open` (`true` | `false`)
- `support-inbox` (`true` | `false`)
- `width` / `height` / `z-index`
- `widget-script-url` (opcional, para sobrescrever a URL do `taiksu-widget.js`)

## 4) Observacoes

- O componente usa `window.TaiksuChat` internamente.
- Hoje o widget funciona como singleton na pagina (uma instancia por vez).
- Se os atributos mudarem, o componente reinicializa automaticamente.
