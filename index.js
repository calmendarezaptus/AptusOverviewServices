"use strict";
// Función del proyecto Consolidado (Catalyst): calendario unificado, liberaciones y configuración
// de proyectos. Todo pasa por ReportesSandbox (core/PrebillApiClient); esta función NO escribe en
// Books (crear el proyecto en Books y sincronizar tareas quedan fuera a propósito).
import express from 'express';
import dotenv from 'dotenv';
import LiberacionService from './services/LiberacionService.js';
import ProyectoConfigService from './services/ProyectoConfigService.js';
import { registerCatalogRoutes } from './core/catalogs.js';
import { sendError } from './core/http.js';

dotenv.config();

const app = express();
app.use(express.json());

// Cada ruta crea su servicio dentro del try: una organización inválida responde 400 en JSON.
const route = (internalMessage, handler, status = 200) => async (req, res) => {
    try { return res.status(status).json(await handler(req)); }
    catch (error) { return sendError(res, error, internalMessage); }
};
const config = req => new ProyectoConfigService(req.params.organizationId, { req });

// ── Liberaciones ─────────────────────────────────────────────────────────────
app.post('/:organizationId/liberaciones', route('Error interno liberando.',
    req => new LiberacionService(req.params.organizationId, { req }).liberar(req.body)));

// ── Configuración del proyecto ───────────────────────────────────────────────
app.get('/:organizationId/proyectos/:proyectoId', route('Error interno consultando el proyecto.', req => config(req).getProyecto(req.params.proyectoId)));
app.patch('/:organizationId/proyectos/:proyectoId', route('Error interno actualizando el proyecto.', req => config(req).updateProyecto(req.params.proyectoId, req.body)));

app.get('/:organizationId/tarifas/resolver', route('Error interno resolviendo la tarifa.', req => config(req).resolverTarifa(req.query)));
app.post('/:organizationId/tarifas', route('Error interno guardando la tarifa.', req => config(req).createTarifa(req.body), 201));
app.patch('/:organizationId/tarifas/:tarifaId', route('Error interno actualizando la tarifa.', req => config(req).updateTarifa(req.params.tarifaId, req.body)));
app.delete('/:organizationId/tarifas/:tarifaId', route('Error interno eliminando la tarifa.', req => config(req).deleteTarifa(req.params.tarifaId)));

app.get('/:organizationId/responsables/resolver', route('Error interno resolviendo responsables.', req => config(req).resolverResponsables(req.query)));
app.post('/:organizationId/responsables', route('Error interno guardando el responsable.', req => config(req).createResponsable(req.body), 201));
app.delete('/:organizationId/responsables/:responsableId', route('Error interno eliminando el responsable.', req => config(req).deleteResponsable(req.params.responsableId)));

// Qué abogados pueden ser responsables (solo lectura; se marcan en Configuración de abogados).
app.get('/:organizationId/abogados-responsables', route('Error interno consultando los abogados responsables.', req => config(req).listElegibles()));

app.get('/:organizationId/impuestos', route('Error interno consultando impuestos.', req => config(req).impuestos()));
app.get('/:organizationId/clientes/:clienteId/config', route('Error interno consultando el cliente.', req => config(req).clienteConfig(req.params.clienteId)));

// ── Lecturas permitidas (GET /:organizationId/<catalogo>) y filtros que se reenvían ──
export const CATALOGS = {
    clientes: [],
    proyectos: [],
    abogados: [],
    'tipos-abogado': [],
    tiempos: ['proyecto_id', 'abogado_id', 'liberado', 'facturado', 'prebill_id', 'facturable', 'tarea_estandar_id', 'books_estado'],
    gastos: ['proyecto_id', 'liberado', 'facturado', 'prebill_id', 'categoria_id', 'facturable', 'abogado_id', 'pagado_por', 'reembolso_estado'],
    'cargos-fijos': ['proyecto_id', 'liberado', 'facturado', 'prebill_id'],
    'liberado-disponible': ['cliente_id', 'moneda'],
    tarifas: ['proyecto_id', 'moneda', 'abogado_id', 'tipo_id', 'nivel'],
    responsables: [],
};
registerCatalogRoutes(app, CATALOGS);

// Sin `stage` a propósito: un 404 con `stage` significa "el registro ya no existe".
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada en aptus_overview_services.' }));

export default app;
