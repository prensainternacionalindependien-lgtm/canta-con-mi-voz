# Canta con mi voz

[Abre el estudio en tu iPhone](https://prensainternacionalindependien-lgtm.github.io/canta-con-mi-voz/).

Elige un audio de tu voz en Archivos o toca **Grabar mi voz**. Usa una toma limpia y sin música. Si la grabación es larga, el control de inicio te permite elegir los 12 segundos que quieres usar.

- **Con mi letra**. Escribe estrofas en español. OmniVoice Singing genera una interpretación a capela con tu muestra como referencia. Puedes separar estrofas con una línea en blanco. Los fragmentos se generan por separado, así que la melodía puede variar entre uno y otro.
- **Con una canción**. Elige una canción que ya tenga cantada tu letra. La app separa las pistas, convierte la voz con Seed-VC siguiendo la melodía original y mezcla el resultado con el acompañamiento. Si ya tienes voz e instrumental por separado, puedes cargarlas directamente.
- **Con Suno**. Puedes copiar la letra, crear la canción en tu cuenta de Suno y descargarla. Vuelve a este estudio y abre el archivo en **Con una canción**. La conexión entre las dos aplicaciones se hace mediante el archivo.
- **Guardar en Archivos**. Escucha el resultado. Toca **Guardar MP3** y después **Descargar MP3**, o elige **Guardar WAV**. Si usas **Compartir**, elige **Guardar en Archivos** en el menú del iPhone.

## Procesamiento y privacidad

La letra se guarda como borrador en el navegador. Al tocar **Cantar**, el navegador envía los datos indicados junto al botón a servicios públicos de Hugging Face. Esos servidores procesan los datos y pueden conservar archivos temporales. Usa grabaciones que quieras compartir con esos servicios. La mezcla y la codificación MP3 se hacen en tu dispositivo. Las grabaciones y canciones de los usuarios no se publican en este repositorio.

Mantén la pestaña abierta mientras se procesa. La app no requiere claves de API. La disponibilidad y las colas dependen de cada servidor. La calidad del parecido y la pronunciación pueden variar con la muestra.

## Código

La aplicación es una web estática en JavaScript. Para probarla en un ordenador, ejecuta `python3 -m http.server 8000` en esta carpeta y visita `http://localhost:8000`. Para grabar con el micrófono desde el móvil, abre la versión HTTPS publicada.

Motores: [OmniVoice Singing](https://huggingface.co/spaces/Kremon96/OmniVoice-Singing), [Seed-VC](https://huggingface.co/spaces/Max-ChenHuan/Seed-VC-SVC) y [Demucs](https://github.com/facebookresearch/demucs). El codificador MP3 es [lamejs](https://github.com/zhuker/lamejs). Cada proyecto mantiene su propia licencia.
