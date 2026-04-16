(function() {
  var CASO1 = {
    ref: "REsp 1.810.170/RS",
    ctx: "Conforme entendimento pacificado no STJ, a cobranca de taxa de conveniencia e abusiva ao consumidor, como decidido no REsp 1.810.170/RS, razao pela qual deve ser reconhecida a ilegalidade da cobranca no presente caso."
  };
  var CASO2 = {
    ref: "0815641-45.2025.8.10.0040",
    ctx: "No ambito deste Egregio Tribunal de Justica do Estado do Maranhao, cumpre citar o precedente firmado nos autos do processo n 0815641-45.2025.8.10.0040, que consolidou entendimento favoravel a tese ora defendida."
  };

  if (location.protocol === "file:") {
    document.getElementById("warnFile").style.display = "block";
  }

  document.getElementById("caso1btn").addEventListener("click", function() {
    document.getElementById("ref").value = CASO1.ref;
    document.getElementById("ctx").value = CASO1.ctx;
    document.getElementById("result").innerHTML = "";
  });

  document.getElementById("caso2btn").addEventListener("click", function() {
    document.getElementById("ref").value = CASO2.ref;
    document.getElementById("ctx").value = CASO2.ctx;
    document.getElementById("result").innerHTML = "";
  });

  document.getElementById("btnVerificar").addEventListener("click", function() {
    verificar();
  });

  document.addEventListener("keydown", function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") verificar();
  });

  function verificar() {
    var ref = document.getElementById("ref").value.trim();
    var ctx = document.getElementById("ctx").value.trim();

    if (!ref || !ctx) {
      alert("Preencha a referencia e o contexto.");
      return;
    }

    var btn      = document.getElementById("btnVerificar");
    var spinner  = document.getElementById("spinner");
    var label    = document.getElementById("btnLabel");
    var result   = document.getElementById("result");
    var progress = document.getElementById("progress");

    btn.disabled            = true;
    spinner.style.display   = "block";
    label.textContent       = "Consultando fontes oficiais...";
    progress.style.display  = "block";
    result.innerHTML        = "";

    fetch("/verificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referencia: ref, contexto: ctx })
    })
    .then(function(resp) { return resp.json(); })
    .then(function(data) {
      if (data.error) {
        result.innerHTML = '<div class="err">Erro: ' + data.error + '</div>';
      } else {
        result.innerHTML = renderResult(data);
      }
      result.scrollIntoView({ behavior: "smooth", block: "start" });
    })
    .catch(function(err) {
      result.innerHTML = '<div class="err">Erro de conexao: ' + err.message + '</div>';
    })
    .finally(function() {
      btn.disabled           = false;
      spinner.style.display  = "none";
      label.textContent      = "Verificar";
      progress.style.display = "none";
    });
  }

  function renderResult(d) {
    var rc   = (d.recomendacao || "").toLowerCase();
    var html = "";

    html += '<div class="banner bg-' + rc + '">';
    html += '<div>';
    html += '<div class="banner-ref">' + (d.referencia_normalizada || "") + " &middot; " + (d.tribunal_inferido || "?") + '</div>';
    html += '<div class="banner-rec c-' + rc + '">' + (d.recomendacao || "") + '</div>';
    html += '</div>';
    html += '<div class="banner-urg">Urgencia: ' + (d.nivel_urgencia || "") + '</div>';
    html += '</div>';

    html += '<div class="grid">';

    // Existencia
    var ex = d.existencia || {};
    html += '<div class="card">';
    html += '<h2>Existencia</h2>';
    html += row("Status", '<span class="s-' + (ex.status || "") + '">' + (ex.status || "—") + '</span>');
    if (ex.numero_real) html += row("Numero real", ex.numero_real);
    html += row("Fonte", ex.fonte || "—");
    if (ex.url_fonte) {
      html += '<div class="row"><span class="rk">Link</span><span class="rv"><a href="' + ex.url_fonte + '" target="_blank">Abrir fonte</a></span></div>';
    }
    html += '<div style="margin-top:.6rem"><span class="rk" style="display:block;margin-bottom:.3rem">Flags</span>' + renderFlags(ex.flags) + '</div>';
    html += '</div>';

    // Conteudo
    var co = d.conteudo || {};
    var semConteudo = !co.assunto_real && (!co.flags || !co.flags.length) && co.dispositivo === "DESCONHECIDO";
    html += '<div class="card">';
    html += '<h2>Conteudo</h2>';
    if (semConteudo && (ex.status === "ERRO_SCRAPING" || ex.status === "NAO_ENCONTRADO" || ex.status === "ERRO_FONTE")) {
      html += '<div class="aviso-indisponivel">Conteúdo não recuperado — processo não localizado nas fontes consultadas ou fonte inacessível. Verifique manualmente no link acima.</div>';
    } else {
      html += row("Assunto real", co.assunto_real || "—");
      html += row("Dispositivo", co.dispositivo || "—");
      html += row("Grau", co.grau || "—");
      html += row("Tema repetitivo", co.tema_repetitivo || "—");
      html += '<div style="margin-top:.6rem"><span class="rk" style="display:block;margin-bottom:.3rem">Flags</span>' + renderFlags(co.flags) + '</div>';
    }
    html += '</div>';

    // Adequacao
    var aq = d.adequacao || {};
    html += '<div class="card" style="grid-column:1/-1">';
    html += '<h2>Adequacao contextual</h2>';
    html += row("Tese inferida na peticao", '<em style="color:#e2e8f0">' + (aq.tese_inferida_na_peticao || "—") + '</em>');
    html += row("Adequacao tematica",    pill(aq.adequacao_tematica,    "t"));
    html += row("Adequacao dispositivo", pill(aq.adequacao_dispositivo, "d"));
    html += row("Peso precedencial",     pill(aq.peso_precedencial,     "p"));
    html += '<div style="margin-top:.7rem"><span class="rk" style="display:block;margin-bottom:.35rem">Justificativa</span>';
    html += '<div class="just">' + (aq.justificativa || "—") + '</div></div>';
    html += '</div>';

    html += '</div>';

    // Motivos
    var meta = d._meta || {};
    if (meta.motivos && meta.motivos.length) {
      html += '<div class="card"><h2>Motivos da recomendacao</h2>';
      for (var i = 0; i < meta.motivos.length; i++) {
        html += '<div class="motivo">' + meta.motivos[i] + '</div>';
      }
      html += '</div>';
    }

    return html;
  }

  function row(key, val) {
    return '<div class="row"><span class="rk">' + key + '</span><span class="rv">' + (val !== undefined && val !== null ? val : "—") + '</span></div>';
  }

  function pill(val, prefix) {
    if (!val) return '<span class="pill" style="color:#64748b">—</span>';
    return '<span class="pill ' + prefix + '-' + val + '">' + val + '</span>';
  }

  function renderFlags(arr) {
    if (!arr || !arr.length) return '<span style="color:#64748b;font-size:.78rem">nenhuma</span>';
    var s = '<div class="flags">';
    for (var i = 0; i < arr.length; i++) {
      s += '<span class="flag">' + arr[i] + '</span>';
    }
    s += '</div>';
    return s;
  }

})();
