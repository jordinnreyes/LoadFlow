export async function mailCode(email: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = (await fetch("http://127.0.0.1:54324/api/v1/messages").then(
      (r) => r.json(),
    )) as { messages: { ID: string; To: { Address: string }[] }[] };
    const item = list.messages.find((m) =>
      m.To.some((to) => to.Address.toLowerCase() === email),
    );
    if (item) {
      const message = (await fetch(
        `http://127.0.0.1:54324/api/v1/message/${item.ID}`,
      ).then((r) => r.json())) as { Text: string; HTML: string };
      const code = (message.Text + " " + message.HTML).match(/\b\d{6}\b/)?.[0];
      if (code) return code;
      throw new Error(
        "El mensaje capturado no contiene un OTP: revisa las plantillas, sin volcar el correo.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("No llegó el correo capturado al Mailpit local.");
}
