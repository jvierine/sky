import { test, expect } from '@playwright/test';
test('catalogue, GPU, epochs, and viewing controls work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await expect(page.locator('#catalog-status')).toContainText('120,530');
  await page.getByRole('button',{name:'Sky',exact:true}).click();
  await page.getByRole('button',{name:'06 Today'}).click();
  await expect(page.locator('body')).toHaveAttribute('data-settled','true');
  await page.getByRole('button',{name:'Model & sources'}).click();
  await page.locator('#cmb-map').uncheck();
  await page.getByRole('button',{name:'Close model details'}).click();
  await expect(page.locator('#epoch-title')).toHaveText('The sky we know.');
  await page.screenshot({path:'test-results/today-desktop.png'});
  const pixelSignature = () => page.locator('#sky').evaluate((canvas:HTMLCanvasElement)=>{
    const gl=canvas.getContext('webgl')!;
    const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let sum=0,bright=0;
    for(let i=0;i<pixels.length;i+=4){sum+=pixels[i]+pixels[i+1]+pixels[i+2];if(pixels[i]>80)bright++;}
    return {sum,bright,error:gl.getError()};
  });
  const today=await pixelSignature();
  expect(today.error).toBe(0);
  expect(today.bright).toBeGreaterThan(200);
  await page.getByRole('button',{name:'01 Recombination'}).click();
  await expect(page.locator('#age')).toContainText('380,000');
  await expect(page.locator('#sky-state')).toContainText('primordial glow');
  await expect(page.locator('body')).toHaveAttribute('data-settled','true');
  const glow=await pixelSignature();
  expect(glow.sum).toBeGreaterThan(today.sum*10);
  await page.screenshot({path:'test-results/recombination-desktop.png'});
  await page.getByRole('button',{name:'02 Dark ages'}).click();
  await expect(page.locator('#sky-state')).toContainText('no stars yet');
  await expect(page.locator('body')).toHaveAttribute('data-settled','true');
  const dark=await pixelSignature();
  expect(dark.bright).toBe(0);
  expect(dark.sum).toBeLessThan(today.sum);
  for(const label of ['03 First stars','04 Reionization','05 Cosmic noon','06 Today']) {
    await page.getByRole('button',{name:label}).click();
    await expect(page.locator('#error')).toBeHidden();
    await page.waitForTimeout(50);
    expect((await pixelSignature()).error).toBe(0);
  }
  await page.locator('#sky').focus();
  await page.keyboard.press('ArrowRight');
  await page.mouse.move(800,420);
  await page.mouse.wheel(0,-300);
  await expect(page.locator('#fov')).not.toHaveText('80°');
  await page.getByRole('button',{name:'Reset view'}).click();
  await expect(page.locator('#fov')).toHaveText('80°');
  await page.getByRole('button',{name:'Model & sources'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#population').uncheck();
  await expect(page.locator('#sky-state')).toContainText('counterfactual');
  await page.locator('#grid').check();
  await page.getByRole('button',{name:'Close model details'}).click();
  await page.getByRole('button',{name:'Play journey'}).click();
  await expect(page.locator('#scale-factor')).not.toHaveValue('1');
  await page.getByRole('button',{name:'Pause journey'}).click();
  expect(errors).toEqual([]);
});
test('scale-factor slider and the secondary Gyr axis agree with the model', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  const slider=page.getByRole('slider',{name:'Scale factor a'});
  await expect(slider).toHaveAttribute('max','1');
  await expect(page.locator('#scale-axis .axis-tick')).toHaveText(['0.001','0.2','0.4','0.6','0.8','1.0']);
  await expect(page.locator('#age-axis .axis-tick').last()).toHaveText('13.8');
  await slider.fill('0.4');
  await expect(page.locator('#scale')).toContainText('0.400');
  await expect(page.locator('#slider-scale')).toHaveText('a = 0.400');
  await expect(slider).toHaveAttribute('aria-valuetext',/Gyr after the Big Bang/);
  const axisAge=Number(await page.locator('#age-axis .axis-tick').nth(2).textContent());
  const actualAge=Number((await page.locator('#age').textContent())!.split(' ')[0]);
  expect(Math.abs(actualAge-axisAge)).toBeLessThan(0.06);
  await expect(page.locator('body')).toHaveAttribute('data-settled','true');
  await page.screenshot({path:'test-results/scale-factor-desktop.png'});
});
test('observed CMB morphs smoothly into expanding structure, with scientific citations', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  const signature=()=>page.locator('#sky').evaluate((canvas:HTMLCanvasElement)=>{
    const gl=canvas.getContext('webgl')!, w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    const pixels=new Uint8Array(w*h*4);
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let bright=0, white=0, radius=0, chromatic=0;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const i=(y*w+x)*4, r=pixels[i],g=pixels[i+1],b=pixels[i+2];
      if(Math.max(r,g,b)>50){bright++;radius+=(x-w/2)**2+(y-h/2)**2;}
      if(Math.min(r,g,b)>245)white++;
      if(Math.max(r,g,b)-Math.min(r,g,b)>35)chromatic++;
    }
    return {bright,white,radius:Math.sqrt(radius/Math.max(1,bright)),chromatic,total:w*h,error:gl.getError()};
  });
  const cmb=await signature();
  expect(cmb.chromatic).toBeGreaterThan(cmb.total*0.3);
  expect(cmb.white).toBe(0);
  await page.screenshot({path:'test-results/wmap-desktop.png'});
  await page.getByRole('button',{name:'03 First stars'}).click();
  await expect(page.locator('body')).toHaveAttribute('data-settled','false');
  await expect(page.locator('body')).toHaveAttribute('data-settled','true');
  await page.screenshot({path:'test-results/first-stars-desktop.png'});
  await page.getByRole('slider',{name:'Scale factor a'}).fill('0.4');
  await expect(page.locator('body')).toHaveAttribute('data-settled','true');
  const compact=await signature();
  await page.getByRole('button',{name:'06 Today'}).click();
  await expect(page.locator('body')).toHaveAttribute('data-settled','true');
  const expanded=await signature();
  expect(expanded.radius).toBeGreaterThan(compact.radius*1.8);
  expect(expanded.bright).toBeGreaterThan(1000);
  expect(expanded.error).toBe(0);
  await page.screenshot({path:'test-results/expansion-today-desktop.png'});
  await page.getByRole('button',{name:'Model & sources'}).click();
  const references=page.locator('.references > li');
  await expect(references).toHaveCount(6);
  await expect(references.nth(1)).toContainText('Planck Collaboration');
  await expect(references.nth(1).locator('a').first()).toHaveAttribute('href','https://doi.org/10.1051/0004-6361/201833910');
  await expect(references.first().locator('a')).toHaveAttribute('href',/lambda.gsfc.nasa.gov/);
  await expect(references.nth(3)).toContainText('The First Galaxies');
});
test('phone layout keeps controls usable and has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await expect(page.locator('.epoch-button[data-index="5"]')).toBeInViewport();
  await page.screenshot({path:'test-results/wmap-mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  for (let i=0;i<6;i++) {
    await page.locator(`.epoch-button[data-index="${i}"]`).click();
    const copy = await page.locator('.epoch-copy').boundingBox();
    const readouts = await page.locator('.readouts').boundingBox();
    expect(copy!.y+copy!.height).toBeLessThan(readouts!.y);
  }
  await page.getByRole('button',{name:'Model & sources'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({path:'test-results/model-mobile.png'});
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('graphics context restores and catalogue failures are explained', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await page.locator('#sky').evaluate((canvas:HTMLCanvasElement)=>{
    const extension=canvas.getContext('webgl')!.getExtension('WEBGL_lose_context')!;
    extension.loseContext();
    setTimeout(()=>extension.restoreContext(),1000);
  });
  await expect(page.locator('#error')).toContainText('graphics connection');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await expect(page.locator('#error')).toBeHidden();
  await page.route('**/tycho2_mag9.bin.gz',route=>route.fulfill({status:503,body:'unavailable'}));
  await page.reload();
  await expect(page.locator('#error')).toContainText('Catalogue request failed (503)');
});
