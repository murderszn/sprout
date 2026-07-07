(function initFeatureTerminals() {
  const npmBody = document.getElementById('clip-npminstall-body');
  const sproutBody = document.getElementById('clip-sproutinstall-body');
  const dryrunBody = document.getElementById('clip-dryrun-body');
  const diagnoseBody = document.getElementById('clip-diagnose-body');
  
  if (!npmBody || !sproutBody || !dryrunBody || !diagnoseBody) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Typewriter helpers
  function appendLine(body, html) {
    const row = document.createElement('div');
    row.className = 't-line visible';
    row.innerHTML = html + `<span class="typed-text"></span>`;
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
    return row;
  }

  function typeText(element, text, speed) {
    return new Promise((resolve) => {
      let i = 0;
      element.textContent = '';
      function type() {
        if (i < text.length) {
          element.textContent += text.charAt(i);
          i++;
          setTimeout(type, speed + Math.random() * 8);
        } else {
          resolve();
        }
      }
      type();
    });
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 1. NPM Install Animation Loop
  async function runNpmInstall() {
    while (true) {
      npmBody.innerHTML = '';
      await wait(500);
      const row1 = appendLine(npmBody, '<span class="t-prompt">$</span> ');
      await typeText(row1.querySelector('.typed-text'), 'npm install -g sprout-install', 35);
      await wait(600);
      
      appendLine(npmBody, '<div class="t-dim">added 48 packages in 2.3s</div>');
      appendLine(npmBody, '<div class="t-ok">✓ sprout-install@0.3.0 installed successfully.</div>');
      await wait(800);
      
      const row2 = appendLine(npmBody, '<div style="margin-top:10px;"><span class="t-prompt">$</span> <span class="typed-text"></span></div>');
      await typeText(row2.querySelector('.typed-text'), 'sprout --version', 40);
      await wait(500);
      
      appendLine(npmBody, '<div>sprout version 0.3.0</div>');
      
      await wait(6000);
    }
  }

  // 2. Sprout Install Animation Loop
  async function runSproutInstall() {
    while (true) {
      sproutBody.innerHTML = '';
      await wait(500);
      const row = appendLine(sproutBody, '<span class="t-prompt">$</span> ');
      await typeText(row.querySelector('.typed-text'), 'sprout install jq', 35);
      await wait(600);
      
      appendLine(sproutBody, '<div>🌱 <span class="t-brand">sprout</span> · <span class="t-accent">install jq</span></div>');
      appendLine(sproutBody, '<div class="t-dim">model: gpt-5.4-mini · status: interactive mode</div>');
      await wait(600);
      
      // Step 1
      appendLine(sproutBody, '<div style="margin-top:8px;color:var(--accent-bright);">⏺ run_shell · step 1</div>');
      appendLine(sproutBody, '<div>  <span class="t-prompt">$</span> command -v jq</div>');
      appendLine(sproutBody, '<div class="t-dim">  ↳ probe if tool exists on PATH</div>');
      await wait(500);
      appendLine(sproutBody, '<div>  <span class="t-dim">⎿</span> <span class="t-fail">✗ exit 1</span> <span class="t-dim">· 0.0s</span></div>');
      await wait(600);
      
      // Step 2
      appendLine(sproutBody, '<div style="margin-top:8px;color:var(--accent-bright);">⏺ run_shell · step 2</div>');
      appendLine(sproutBody, '<div>  <span class="t-prompt">$</span> brew install jq</div>');
      appendLine(sproutBody, '<div class="t-dim">  ↳ install jq via Homebrew (canonical package manager)</div>');
      await wait(500);
      
      const confirmRow = appendLine(sproutBody, '  <span style="color:var(--yellow)">Run this command?</span> ');
      await wait(400);
      await typeText(confirmRow.querySelector('.typed-text'), 'yes', 50);
      await wait(400);
      appendLine(sproutBody, '<div>  <span class="t-dim">⎿</span> <span class="t-ok">✓ exit 0</span> <span class="t-dim">· 3.4s</span></div>');
      await wait(800);
      
      // Step 3
      appendLine(sproutBody, '<div style="margin-top:8px;color:var(--accent-bright);">⏺ run_shell · step 3</div>');
      appendLine(sproutBody, '<div>  <span class="t-prompt">$</span> jq --version</div>');
      appendLine(sproutBody, '<div class="t-dim">  ↳ verify installation</div>');
      await wait(400);
      appendLine(sproutBody, '<div>  <span class="t-dim">⎿ jq-1.7.1</span></div>');
      appendLine(sproutBody, '<div>  <span class="t-dim">⎿</span> <span class="t-ok">✓ exit 0</span> <span class="t-dim">· 0.1s</span></div>');
      await wait(800);
      
      // Summary
      appendLine(sproutBody, '<div style="margin-top:10px;">🌱 <span class="t-brand">run summary:</span></div>');
      appendLine(sproutBody, '<div class="t-ok">✓ command -v jq</div>');
      appendLine(sproutBody, '<div class="t-ok">✓ brew install jq</div>');
      appendLine(sproutBody, '<div class="t-ok">✓ jq --version -> jq-1.7.1 verified!</div>');
      
      await wait(8000);
    }
  }

  // 3. Dry Run Animation Loop
  async function runDryRun() {
    while (true) {
      dryrunBody.innerHTML = '';
      await wait(500);
      const row = appendLine(dryrunBody, '<span class="t-prompt">$</span> ');
      await typeText(row.querySelector('.typed-text'), 'sprout --dry-run install node', 35);
      await wait(600);
      
      appendLine(dryrunBody, '<div>🌱 <span class="t-brand">sprout</span> · <span class="t-accent">install node (dry-run)</span></div>');
      appendLine(dryrunBody, '<div class="t-dim">model: gpt-5.4-mini · status: dry-run mode</div>');
      await wait(600);
      
      // Step 1
      appendLine(dryrunBody, '<div style="margin-top:8px;color:var(--accent-bright);">⏺ run_shell · step 1</div>');
      appendLine(dryrunBody, '<div>  <span class="t-prompt">$</span> command -v node</div>');
      appendLine(dryrunBody, '<div class="t-dim">  ↳ check existing node on PATH</div>');
      await wait(500);
      appendLine(dryrunBody, '<div>  <span class="t-dim">⎿</span> <span style="color:var(--purple)">dry-run — recorded, not executed</span></div>');
      await wait(600);
      
      // Step 2
      appendLine(dryrunBody, '<div style="margin-top:8px;color:var(--accent-bright);">⏺ run_shell · step 2</div>');
      appendLine(dryrunBody, '<div>  <span class="t-prompt">$</span> brew install node</div>');
      appendLine(dryrunBody, '<div class="t-dim">  ↳ install node via Homebrew</div>');
      await wait(500);
      appendLine(dryrunBody, '<div>  <span class="t-dim">⎿</span> <span style="color:var(--purple)">dry-run — recorded, not executed</span></div>');
      await wait(600);
      
      // Step 3
      appendLine(dryrunBody, '<div style="margin-top:8px;color:var(--accent-bright);">⏺ run_shell · step 3</div>');
      appendLine(dryrunBody, '<div>  <span class="t-prompt">$</span> node --version</div>');
      appendLine(dryrunBody, '<div class="t-dim">  ↳ verify installation</div>');
      await wait(500);
      appendLine(dryrunBody, '<div>  <span class="t-dim">⎿</span> <span style="color:var(--purple)">dry-run — recorded, not executed</span></div>');
      await wait(800);
      
      // Summary
      appendLine(dryrunBody, '<div style="margin-top:10px;">🌱 <span class="t-brand">dry-run summary:</span></div>');
      appendLine(dryrunBody, '<div class="t-dim">1. command -v node</div>');
      appendLine(dryrunBody, '<div class="t-dim">2. brew install node</div>');
      appendLine(dryrunBody, '<div class="t-dim">3. node --version</div>');
      appendLine(dryrunBody, '<div class="t-ok">✓ [Dry Run complete. No files or system paths modified]</div>');
      
      await wait(8000);
    }
  }

  // 4. Diagnose Animation Loop
  async function runDiagnose() {
    while (true) {
      diagnoseBody.innerHTML = '';
      await wait(500);
      const row = appendLine(diagnoseBody, '<span class="t-prompt">$</span> ');
      await typeText(row.querySelector('.typed-text'), 'sprout diagnose', 35);
      await wait(600);
      
      appendLine(diagnoseBody, '<div class="t-dim">[Paste build log. Press Ctrl-D when done]</div>');
      appendLine(diagnoseBody, '<div style="color:var(--danger)">> node-gyp rebuild failed: make failed with exit code 2</div>');
      appendLine(diagnoseBody, '<div style="color:var(--danger)">> python3: command not found</div>');
      await wait(800);
      
      appendLine(diagnoseBody, '<div style="margin-top:8px;">🌱 <span class="t-brand">sprout</span> · <span class="t-accent">diagnose</span></div>');
      appendLine(diagnoseBody, '<div class="t-dim">model: gpt-5.4-mini · status: diagnose mode</div>');
      await wait(600);
      
      // Step 1
      appendLine(diagnoseBody, '<div style="margin-top:8px;color:var(--accent-bright);">⏺ run_shell · step 1</div>');
      appendLine(diagnoseBody, '<div>  <span class="t-prompt">$</span> command -v python3</div>');
      appendLine(diagnoseBody, '<div class="t-dim">  ↳ check if python3 exists</div>');
      await wait(500);
      appendLine(diagnoseBody, '<div>  <span class="t-dim">⎿</span> <span class="t-fail">✗ exit 1</span> <span class="t-dim">· 0.0s</span></div>');
      await wait(600);
      
      // Step 2
      appendLine(diagnoseBody, '<div style="margin-top:8px;color:var(--accent-bright);">⏺ run_shell · step 2</div>');
      appendLine(diagnoseBody, '<div>  <span class="t-prompt">$</span> brew install python3</div>');
      appendLine(diagnoseBody, '<div class="t-dim">  ↳ install python3 compiler dependency</div>');
      await wait(500);
      
      const confirmRow = appendLine(diagnoseBody, '  <span style="color:var(--yellow)">Run this command?</span> ');
      await wait(400);
      await typeText(confirmRow.querySelector('.typed-text'), 'yes', 50);
      await wait(400);
      appendLine(diagnoseBody, '<div>  <span class="t-dim">⎿</span> <span class="t-ok">✓ exit 0</span> <span class="t-dim">· 12.8s</span></div>');
      await wait(800);
      
      // Step 3
      appendLine(diagnoseBody, '<div style="margin-top:8px;color:var(--accent-bright);">⏺ run_shell · step 3</div>');
      appendLine(diagnoseBody, '<div>  <span class="t-prompt">$</span> python3 --version</div>');
      appendLine(diagnoseBody, '<div class="t-dim">  ↳ verify compiler</div>');
      await wait(400);
      appendLine(diagnoseBody, '<div>  <span class="t-dim">⎿ Python 3.12.3</span></div>');
      appendLine(diagnoseBody, '<div>  <span class="t-dim">⎿</span> <span class="t-ok">✓ exit 0</span> <span class="t-dim">· 0.1s</span></div>');
      await wait(800);
      
      // Summary
      appendLine(diagnoseBody, '<div style="margin-top:10px;">🌱 <span class="t-brand">diagnosis:</span></div>');
      appendLine(diagnoseBody, '<div>Missing Python compiler environment caused the build failure.</div>');
      appendLine(diagnoseBody, '<div class="t-ok">Fix: python3 has been installed and verified. Ready to retry rebuild.</div>');
      
      await wait(8000);
    }
  }

  if (!prefersReducedMotion) {
    runNpmInstall();
    runSproutInstall();
    runDryRun();
    runDiagnose();
  } else {
    // If reduced motion, just show the finished states statically
    npmBody.innerHTML = `<span class="t-prompt">$</span> npm install -g sprout-install<br><div class="t-dim">added 48 packages in 2.3s</div><div class="t-ok">✓ sprout-install@0.3.0 installed successfully.</div><br><span class="t-prompt">$</span> sprout --version<br><div>sprout version 0.3.0</div>`;
    
    sproutBody.innerHTML = `<span class="t-prompt">$</span> sprout install jq<br><div>🌱 <span class="t-brand">sprout</span> · <span class="t-accent">install jq</span></div><div class="t-dim">model: gpt-5.4-mini · status: interactive mode</div><br><div style="color:var(--accent-bright);">⏺ run_shell · step 1</div><div>  <span class="t-prompt">$</span> command -v jq</div><div class="t-dim">  ↳ probe if tool exists on PATH</div><div>  <span class="t-dim">⎿</span> <span class="t-fail">✗ exit 1</span></div><br><div style="color:var(--accent-bright);">⏺ run_shell · step 2</div><div>  <span class="t-prompt">$</span> brew install jq</div><div class="t-dim">  ↳ install jq via Homebrew</div>  <span style="color:var(--yellow)">Run this command?</span> yes<br><div>  <span class="t-dim">⎿</span> <span class="t-ok">✓ exit 0</span></div><br><div style="color:var(--accent-bright);">⏺ run_shell · step 3</div><div>  <span class="t-prompt">$</span> jq --version</div><div class="t-dim">  ↳ verify installation</div><div>  <span class="t-dim">⎿ jq-1.7.1</span></div><div>  <span class="t-dim">⎿</span> <span class="t-ok">✓ exit 0</span></div><br><div>🌱 <span class="t-brand">run summary:</span></div><div class="t-ok">✓ command -v jq</div><div class="t-ok">✓ brew install jq</div><div class="t-ok">✓ jq --version -> jq-1.7.1 verified!</div>`;
    
    dryrunBody.innerHTML = `<span class="t-prompt">$</span> sprout --dry-run install node<br><div>🌱 <span class="t-brand">sprout</span> · <span class="t-accent">install node (dry-run)</span></div><div class="t-dim">model: gpt-5.4-mini · status: dry-run mode</div><br><div style="color:var(--accent-bright);">⏺ run_shell · step 1</div><div>  <span class="t-prompt">$</span> command -v node</div><div class="t-dim">  ↳ check existing node on PATH</div><div>  <span class="t-dim">⎿</span> <span style="color:var(--purple)">dry-run — recorded, not executed</span></div><br><div style="color:var(--accent-bright);">⏺ run_shell · step 2</div><div>  <span class="t-prompt">$</span> brew install node</div><div class="t-dim">  ↳ install node via Homebrew</div><div>  <span class="t-dim">⎿</span> <span style="color:var(--purple)">dry-run — recorded, not executed</span></div><br><div style="color:var(--accent-bright);">⏺ run_shell · step 3</div><div>  <span class="t-prompt">$</span> node --version</div><div class="t-dim">  ↳ verify installation</div><div>  <span class="t-dim">⎿</span> <span style="color:var(--purple)">dry-run — recorded, not executed</span></div><br><div>🌱 <span class="t-brand">dry-run summary:</span></div><div class="t-dim">1. command -v node</div><div class="t-dim">2. brew install node</div><div class="t-dim">3. node --version</div><div class="t-ok">✓ [Dry Run complete. No files or system paths modified]</div>`;
    
    diagnoseBody.innerHTML = `<span class="t-prompt">$</span> sprout diagnose<br><div class="t-dim">[Paste build log. Press Ctrl-D when done]</div><div style="color:var(--danger)">> node-gyp rebuild failed: make failed with exit code 2</div><div style="color:var(--danger)">> python3: command not found</div><br><div>🌱 <span class="t-brand">sprout</span> · <span class="t-accent">diagnose</span></div><div class="t-dim">model: gpt-5.4-mini · status: diagnose mode</div><br><div style="color:var(--accent-bright);">⏺ run_shell · step 1</div><div>  <span class="t-prompt">$</span> command -v python3</div><div class="t-dim">  ↳ check if python3 exists</div><div>  <span class="t-dim">⎿</span> <span class="t-fail">✗ exit 1</span></div><br><div style="color:var(--accent-bright);">⏺ run_shell · step 2</div><div>  <span class="t-prompt">$</span> brew install python3</div><div class="t-dim">  ↳ install python3 compiler dependency</div>  <span style="color:var(--yellow)">Run this command?</span> yes<br><div>  <span class="t-dim">⎿</span> <span class="t-ok">✓ exit 0</span></div><br><div style="color:var(--accent-bright);">⏺ run_shell · step 3</div><div>  <span class="t-prompt">$</span> python3 --version</div><div class="t-dim">  ↳ verify compiler</div><div>  <span class="t-dim">⎿ Python 3.12.3</span></div><div>  <span class="t-dim">⎿</span> <span class="t-ok">✓ exit 0</span></div><br><div>🌱 <span class="t-brand">diagnosis:</span></div><div>Missing Python compiler environment caused the build failure.</div><div class="t-ok">Fix: python3 has been installed and verified. Ready to retry rebuild.</div>`;
  }
})();
