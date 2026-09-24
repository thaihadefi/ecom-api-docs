(function () {
  "use strict";

  function init() {
    var container = document.getElementById("swagger-ui");
    if (!container) return;

    if (typeof SwaggerUIBundle === "undefined") {
      container.innerHTML =
        '<p style="padding:24px">Swagger UI could not be loaded. Read the raw specification instead: ' +
        '<a href="openapi.yaml">openapi.yaml</a> or <a href="openapi.json">openapi.json</a>.</p>';
      return;
    }

    var specSource = typeof apiSpec !== "undefined" ? apiSpec : "openapi.json";

    window.ui = SwaggerUIBundle({
      spec: specSource,
      dom_id: "#swagger-ui",
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: "BaseLayout",
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
      docExpansion: "none",
      displayRequestDuration: true,
      persistAuthorization: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      tryItOutEnabled: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
