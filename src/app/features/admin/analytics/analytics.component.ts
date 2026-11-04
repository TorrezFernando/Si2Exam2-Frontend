import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Chart, registerables } from 'chart.js';
import { environment } from '../../../../environments/environment';
Chart.register(...registerables);

@Component({
  selector: 'app-analytics', standalone: true, imports: [CommonModule, FormsModule],
  template: `
  <div class="content-area">
    <h1>Reportes con IA y análisis de demanda</h1>
    <p class="text-secondary">Consulta tu empresa con filtros o lenguaje natural. Requiere Plan Profesional y permisos de reportes.</p>
    <div class="card" style="padding:24px;margin:20px 0">
      <label for="prompt">¿Qué quieres conocer?</label>
      <textarea id="prompt" class="form-control" rows="3" [(ngModel)]="prompt" placeholder="Ventas por sucursal de enero a marzo de 2026"></textarea>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-primary" [disabled]="busy() || !prompt.trim()" (click)="interpret()">Consultar con IA</button>
        <button class="btn btn-outline" [disabled]="busy() || listening()" (click)="voice()">{{listening() ? 'Escuchando…' : 'Dictar consulta'}}</button>
      </div>
    </div>
    <div class="card" style="padding:24px">
      <h2>Filtros del reporte</h2>
      <div class="filters">
        <label>Reporte<select class="form-select" [(ngModel)]="spec.kind"><option *ngFor="let k of kinds" [value]="k[0]">{{k[1]}}</option></select></label>
        <label>Desde<input class="form-control" type="date" [(ngModel)]="spec.start"></label>
        <label>Hasta<input class="form-control" type="date" [(ngModel)]="spec.end"></label>
        <label>Sucursal (ID opcional)<input class="form-control" type="number" min="1" [(ngModel)]="spec.branch_id"></label>
        <label>Categoría (ID opcional)<input class="form-control" type="number" min="1" [(ngModel)]="spec.category_id"></label>
        <label>Gráfico<select class="form-select" [(ngModel)]="spec.chart"><option value="bar">Barras</option><option value="line">Líneas</option></select></label>
      </div>
      <button class="btn btn-primary" [disabled]="busy()" (click)="generate()">Generar reporte</button>
    </div>
    <p role="status" aria-live="polite" style="padding:12px 0">{{message()}}</p>
    <section class="card" style="padding:24px" [hidden]="!result()">
      <h2>{{result()?.company}}</h2><p>{{result()?.note}}</p>
      <div style="height:320px"><canvas #canvas aria-label="Gráfico del reporte" role="img"></canvas></div>
      <div style="overflow:auto"><table class="table"><thead><tr><th *ngFor="let c of result()?.columns">{{c}}</th></tr></thead><tbody><tr *ngFor="let row of result()?.rows"><td *ngFor="let value of row">{{value}}</td></tr></tbody></table></div>
      <p *ngIf="result() && !result().rows.length">Sin resultados para los filtros seleccionados.</p>
      <button class="btn btn-outline" [disabled]="busy()" (click)="download('pdf')">Exportar PDF</button>
      <button class="btn btn-outline" [disabled]="busy()" (click)="download('xlsx')">Exportar Excel</button>
    </section>
    <section class="card" style="padding:24px;margin-top:24px">
      <h2>Predicción y segmentación</h2>
      <p>Random Forest predice unidades del siguiente mes por sucursal/categoría. K-Means agrupa productos según ventas, ingresos y meses activos.</p>
      <label><input type="checkbox" [(ngModel)]="demo"> Utilizar datos sintéticos de demostración</label>
      <button class="btn btn-primary" [disabled]="busy()" (click)="train()">Entrenar y analizar</button>
      <ng-container *ngIf="ml() as model">
        <p><strong>{{model.source === 'synthetic' ? 'DATOS SINTÉTICOS' : 'HISTORIAL REAL'}}</strong> · {{model.warning}}</p>
        <p>R²: {{model.metrics.r2 | number:'1.2-3'}} · MAE: {{model.metrics.mae | number:'1.2-2'}} · RMSE: {{model.metrics.rmse | number:'1.2-2'}} · Silhouette: {{model.silhouette | number:'1.2-3'}}</p>
        <p>{{model.metrics.split}} · Entrenamiento: {{model.metrics.train_rows}} filas · Evaluación: {{model.metrics.test_rows}} filas</p>
        <div style="height:300px"><canvas #mlCanvas aria-label="Predicción de unidades por sucursal y categoría" role="img"></canvas></div>
        <div style="overflow:auto"><table class="table"><thead><tr><th>Sucursal</th><th>Categoría</th><th>Mes</th><th>Unidades previstas</th></tr></thead><tbody><tr *ngFor="let f of model.forecast"><td>{{f.branch_id}}</td><td>{{f.category_id}}</td><td>{{f.month}}</td><td>{{f.units}}</td></tr></tbody></table></div>
        <h3>Segmentos de productos</h3><div style="overflow:auto"><table class="table"><thead><tr><th>Producto</th><th>Grupo</th><th>Unidades</th><th>Ingresos</th></tr></thead><tbody><tr *ngFor="let s of model.segments"><td>{{s.product_id}}</td><td>{{s.cluster + 1}}</td><td>{{s.units}}</td><td>{{s.revenue}}</td></tr></tbody></table></div>
      </ng-container>
    </section>
  </div>`,
  styles: [`.filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px;margin:16px 0} label{display:block}button{margin:8px 8px 0 0}table{width:100%;text-align:left}th,td{padding:10px;border-bottom:1px solid var(--border-subtle)}`]
})
export class AnalyticsComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('mlCanvas') mlCanvas?: ElementRef<HTMLCanvasElement>;
  private chart?: Chart; private mlChart?: Chart; private speech?: any;
  busy=signal(false); listening=signal(false); message=signal('');result=signal<any>(null);ml=signal<any>(null);
  prompt='';demo=false;
  spec:any={kind:'monthly_branch',start:new Date(new Date().getFullYear(),0,1).toISOString().slice(0,10),end:new Date().toISOString().slice(0,10),branch_id:null,category_id:null,chart:'bar'};
  kinds=[['monthly_branch','Ventas por sucursal y mes'],['top_products','Top 10 productos'],['weekly_sales','Ventas semanales'],['quarterly_branches','Comparativa trimestral'],['low_stock','Menor existencia'],['category_revenue','Ingresos por categoría']];
  constructor(private http:HttpClient){}
  ngAfterViewInit(){}
  ngOnDestroy(){this.result.set(null);this.chart?.destroy();this.mlChart?.destroy();this.speech?.abort();}
  private fail(e:any){this.busy.set(false);this.message.set(typeof e.error?.detail==='string'?e.error.detail:'No se pudo completar la consulta. Revisa los filtros y el acceso al plan.');}
  private show(data:any){this.busy.set(false);if(data.clarification){this.message.set(data.clarification);return;}this.result.set(data);this.spec={...data.spec};this.message.set('Reporte generado.');setTimeout(()=>{if(this.result()!==data)return;this.chart?.destroy();this.chart=new Chart(this.canvas.nativeElement,{type:data.chart,data:{labels:data.rows.map((r:any)=>r[0]),datasets:[{label:data.columns[1],data:data.rows.map((r:any)=>r[1]),backgroundColor:'#7965ed',borderColor:'#7965ed'}]},options:{responsive:true,maintainAspectRatio:false}});});}
  generate(){this.busy.set(true);this.http.post(environment.apiUrl+'/analytics/report',this.spec).subscribe({next:d=>this.show(d),error:e=>this.fail(e)});}
  interpret(){this.busy.set(true);this.http.post(environment.apiUrl+'/analytics/interpret',{prompt:this.prompt}).subscribe({next:d=>this.show(d),error:e=>this.fail(e)});}
  voice(){const Speech=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;if(!Speech){this.message.set('El navegador no admite dictado. Puedes escribir tu consulta.');return;}this.speech=new Speech();this.speech.lang='es-BO';this.speech.onresult=(e:any)=>{this.prompt=e.results[0][0].transcript;};this.speech.onerror=()=>{this.listening.set(false);this.message.set('No se pudo usar el micrófono. Revisa los permisos o escribe la consulta.');};this.speech.onend=()=>this.listening.set(false);this.listening.set(true);try{this.speech.start();}catch{this.listening.set(false);}}
  download(format:string){if(!this.result())return;this.busy.set(true);this.http.post(environment.apiUrl+'/analytics/export/'+format,this.result().spec,{responseType:'blob'}).subscribe({next:b=>{const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='reporte.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);this.busy.set(false);},error:e=>this.fail(e)});}
  train(){this.busy.set(true);this.message.set('Entrenando modelos…');this.http.post<any>(environment.apiUrl+'/analytics/ml',{demo:this.demo,branch_id:this.spec.branch_id||null}).subscribe({next:d=>{this.ml.set(d);this.busy.set(false);this.message.set('Análisis terminado.');setTimeout(()=>{if(!this.mlCanvas)return;this.mlChart?.destroy();this.mlChart=new Chart(this.mlCanvas.nativeElement,{type:'bar',data:{labels:d.forecast.map((f:any)=>'Suc. '+f.branch_id+' / Cat. '+f.category_id),datasets:[{label:'Unidades previstas',data:d.forecast.map((f:any)=>f.units),backgroundColor:'#e568a5'}]},options:{responsive:true,maintainAspectRatio:false}});});},error:e=>this.fail(e)});}
}
