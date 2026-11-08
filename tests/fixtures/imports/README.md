# Corpus sintético F3

Los archivos de este directorio contienen códigos, títulos y fechas ficticios.

- `anexo.xlsx` tiene cinco PC y dos exámenes en dos hojas, una tercera hoja de contexto, un encabezado horizontal combinado, curso combinado verticalmente, fechas numéricas con formato, horas, y una fórmula con resultado cacheado.
- `epoch-1904.xlsx` cubre el sistema de fechas 1904, una fecha textual ambigua, un número sin estilo de fecha y una fecha inválida.
- `too-many-sheets.xlsx` contiene 21 hojas vacías y `too-many-cells.xlsx` contiene 20 001 celdas de texto sintético, para comprobar límites.
- `protected.pdf` es una página sintética vacía cifrada con una contraseña de fixture.
- `pdf-fixture.ts` genera PDF textual con coordenadas reales para enunciados, tablas, semanas de sílabo y páginas sin texto. Los valores que recibe cambian entre pruebas.

F7 añade reconstrucciones de un enunciado grupal y un anexo con fechas contradictorias, además de una página rasterizada con una imagen monocromática y sin capa de texto. El informe por campo y las pruebas de revisión están en [F7-VALIDATION.md](../../../docs/F7-VALIDATION.md).

Las pruebas comparan campos y estados esperados. Los siete PDF personales usados para el benchmark permanecen en sus rutas originales, fuera del repositorio.
