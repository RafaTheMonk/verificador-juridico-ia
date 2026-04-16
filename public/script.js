(function () {
  var CASO1 = {
    ref: "REsp 1.810.170/RS",
    ctx: "Conforme entendimento pacificado no STJ, a cobrança de taxa de conveniência é abusiva ao consumidor, como decidido no REsp 1.810.170/RS, razão pela qual deve ser reconhecida a ilegalidade da cobrança no presente caso."
  };
  var CASO2 = {
    ref: "0815641-45.2025.8.10.0040",
    ctx: "No âmbito deste Egrégio Tribunal de Justiça do Estado do Maranhão, cumpre citar o precedente firmado nos autos do processo nº 0815641-45.2025.8.10.0040, que consolidou entendimento favorável à tese ora defendida."
  };

  // ── Aviso file:// ──────────────────────────────────────────────────────────
  if (location.protocol === "file:") {
    document.getElementById("warnFile").style.display = "block";
  }

  // ── Casos de teste ─────────────────────────────────────────────────────────
  document.getElementById("caso1btn").addEventListener("click", function () {
    document.getElementById("ref").value = CASO1.ref;
    document.getElementById("ctx").value = CASO1.ctx;
  });

  document.getElementById("caso2btn").addEventListener("click", function () {
    document.getElementById("ref").value = CASO2.ref;
    document.getElementById("ctx").value = CASO2.ctx;
  });

  // ── Botão verificar ────────────────────────────────────────────────────────
  document.getElementById("btnVerificar").addEventListener("click", function () {
    verificar();
  });

  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") verificar();
  });

  // ── Modal ──────────────────────────────────────────────────────────────────
  var overlay = document.getElementById("modal-overlay");
  var modalBody = document.getElementById("modalBody");

  function abrirModal(html) {
    modalBody.innerHTML = html;
    overlay.classList.add("ativo");
    document.body.style.overflow = "hidden";
    document.getElementById("modalClose").focus();
  }

  function fecharModal() {
    overlay.classList.remove("ativo");
    document.body.style.overflow = "";
    modalBody.innerHTML = "";
  }

  document.getElementById("modalClose").addEventListener("click", fecharModal);

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) fecharModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") fecharModal();
  });

  // ── Verificação ────────────────────────────────────────────────────────────
  function verificar() {
    var ref = document.getElementById("ref").value.trim();
    var ctx = document.getElementById("ctx").value.trim();

    if (!ref || !ctx) {
      alert("Preencha a referência e o contexto.");
      return;
    }

    var btn      = document.getElementById("btnVerificar");
    var spinner  = document.getElementById("spinner");
    var label    = document.getElementById("btnLabel");
    var progress = document.getElementById("progress");

    btn.disabled           = true;
    spinner.style.display  = "inline-block";
    label.textContent      = "Consultando fontes oficiais...";
    progress.style.display = "block";

    fetch("/verificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referencia: ref, contexto: ctx })
    })
      .then(function (resp) {
        if (!resp.ok && resp.status !== 400) {
          throw new Error("Servidor retornou HTTP " + resp.status);
        }
        return resp.json();
      })
      .then(function (data) {
        if (data.error) {
          abrirModal('<div class="err">Erro: ' + escHtml(data.error) + '</div>');
        } else {
          abrirModal(renderResult(data));
        }
      })
      .catch(function (err) {
        abrirModal('<div class="err">Erro de conexão: ' + escHtml(err.message) + '<br><small>Verifique se o servidor está rodando (<code>npm run dev</code>).</small></div>');
      })
      .finally(function () {
        btn.disabled           = false;
        spinner.style.display  = "none";
        label.textContent      = "Verificar";
        progress.style.display = "none";
      });
  }

  // ── Renderização ───────────────────────────────────────────────────────────
  function renderResult(d) {
    var rc   = (d.recomendacao || "").toLowerCase();
    var html = "";

    // Banner principal
    html += '<div class="banner bg-' + rc + '">';
    html += '<div>';
    html += '<div class="banner-ref">' + escHtml(d.referencia_normalizada || "") + ' &middot; ' + escHtml(d.tribunal_inferido || "?") + '</div>';
    html += '<div class="banner-rec c-' + rc + '">' + escHtml(d.recomendacao || "") + '</div>';
    html += '</div>';
    html += '<div class="banner-urg">Urgência: ' + escHtml(d.nivel_urgencia || "") + '</div>';
    html += '</div>';

    html += '<div class="grid">';

    // Existência
    var ex = d.existencia || {};
    html += '<div class="card">';
    html += '<h2>Existência</h2>';
    html += row("Status", '<span class="s-' + (ex.status || "") + '">' + escHtml(ex.status || "—") + '</span>');
    if (ex.numero_real) html += row("Número real", escHtml(ex.numero_real));
    html += row("Fonte", escHtml(ex.fonte || "—"));
    if (ex.url_fonte) {
      html += '<div class="row"><span class="rk">Link</span><span class="rv"><a href="' + escAttr(ex.url_fonte) + '" target="_blank" rel="noopener">Abrir fonte oficial</a></span></div>';
    }
    html += '<div style="margin-top:.6rem"><span class="rk" style="display:block;margin-bottom:.3rem">Flags</span>' + renderFlags(ex.flags) + '</div>';
    html += '</div>';

    // Conteúdo
    var co = d.conteudo || {};
    var semConteudo = !co.assunto_real && (!co.flags || !co.flags.length) && co.dispositivo === "DESCONHECIDO";
    html += '<div class="card">';
    html += '<h2>Conteúdo</h2>';
    if (semConteudo && (ex.status === "ERRO_SCRAPING" || ex.status === "NAO_ENCONTRADO" || ex.status === "ERRO_FONTE")) {
      html += '<div class="aviso-indisponivel">Conteúdo não recuperado — processo não localizado nas fontes consultadas ou fonte inacessível. Verifique manualmente no link acima.</div>';
    } else {
      html += row("Assunto real", escHtml(co.assunto_real || "—"));
      html += row("Dispositivo", escHtml(co.dispositivo || "—"));
      html += row("Grau", escHtml(co.grau || "—"));
      html += row("Tema repetitivo", escHtml(co.tema_repetitivo || "—"));
      html += '<div style="margin-top:.6rem"><span class="rk" style="display:block;margin-bottom:.3rem">Flags</span>' + renderFlags(co.flags) + '</div>';
    }
    html += '</div>';

    // Adequação
    var aq = d.adequacao || {};
    html += '<div class="card" style="grid-column:1/-1">';
    html += '<h2>Adequação contextual</h2>';
    html += row("Tese inferida na petição", '<em style="color:#e2e8f0">' + escHtml(aq.tese_inferida_na_peticao || "—") + '</em>');
    html += row("Adequação temática",    pill(aq.adequacao_tematica,    "t"));
    html += row("Adequação dispositivo", pill(aq.adequacao_dispositivo, "d"));
    html += row("Peso precedencial",     pill(aq.peso_precedencial,     "p"));
    html += '<div style="margin-top:.7rem"><span class="rk" style="display:block;margin-bottom:.35rem">Justificativa</span>';
    html += '<div class="just">' + escHtml(aq.justificativa || "—") + '</div></div>';
    html += '</div>';

    html += '</div>';

    // Motivos
    var meta = d._meta || {};
    if (meta.motivos && meta.motivos.length) {
      html += '<div class="card"><h2>Motivos da recomendação</h2>';
      for (var i = 0; i < meta.motivos.length; i++) {
        html += '<div class="motivo">' + escHtml(meta.motivos[i]) + '</div>';
      }
      html += '</div>';
    }

    return html;
  }

  function row(key, val) {
    return '<div class="row"><span class="rk">' + key + '</span><span class="rv">' + (val != null ? val : "—") + '</span></div>';
  }

  function pill(val, prefix) {
    if (!val) return '<span class="pill" style="color:#64748b">—</span>';
    return '<span class="pill ' + prefix + '-' + escAttr(val) + '">' + escHtml(val) + '</span>';
  }

  function renderFlags(arr) {
    if (!arr || !arr.length) return '<span style="color:#64748b;font-size:.78rem">nenhuma</span>';
    var s = '<div class="flags">';
    for (var i = 0; i < arr.length; i++) {
      s += '<span class="flag">' + escHtml(arr[i]) + '</span>';
    }
    s += '</div>';
    return s;
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escAttr(s) {
    return String(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

})();
