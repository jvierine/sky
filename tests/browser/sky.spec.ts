import { test, expect } from '@playwright/test';
test('catalogue, GPU, epochs, and viewing controls work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await expect(page.locator('#catalog-status')).toContainText('42,072');
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
  await page.waitForTimeout(100);
  const glow=await pixelSignature();
  expect(glow.sum).toBeGreaterThan(today.sum*10);
  await page.screenshot({path:'test-results/recombination-desktop.png'});
  await page.getByRole('button',{name:'02 Dark ages'}).click();
  await expect(page.locator('#sky-state')).toContainText('no stars yet');
  await page.waitForTimeout(100);
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
  await page.getByRole('button',{name:'The model'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#population').uncheck();
  await expect(page.locator('#sky-state')).toContainText('counterfactual');
  await page.locator('#grid').check();
  await page.getByRole('button',{name:'Close model details'}).click();
  await page.getByRole('button',{name:'Play journey'}).click();
  await expect(page.locator('#time')).not.toHaveValue('1000');
  await page.getByRole('button',{name:'Pause journey'}).click();
  expect(errors).toEqual([]);
});
test('phone layout keeps controls usable and has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await expect(page.locator('.epoch-button[data-index="5"]')).toBeInViewport();
  await page.screenshot({path:'test-results/today-mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  for (let i=0;i<6;i++) {
    await page.locator(`.epoch-button[data-index="${i}"]`).click();
    const copy = await page.locator('.epoch-copy').boundingBox();
    const readouts = await page.locator('.readouts').boundingBox();
    expect(copy!.y+copy!.height).toBeLessThan(readouts!.y);
  }
  await page.getByRole('button',{name:'The model'}).click();
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
  await page.route('**/tycho2_mag8.bin.gz',route=>route.fulfill({status:503,body:'unavailable'}));
  await page.reload();
  await expect(page.locator('#error')).toContainText('Catalogue request failed (503)');
});
