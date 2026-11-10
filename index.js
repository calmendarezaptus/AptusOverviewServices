"use strict";
// Función del proyecto Consolidado (Catalyst): calendario unificado, liberaciones y configuración
// de proyectos. Esqueleto: por ahora solo las lecturas del calendario unificado.
// Todo pasa por ReportesSandbox (core/PrebillApiClient); esta función no escribe en Books.
// Pendiente: liberaciones y PATCH de configuración de proyecto.
import express from 'express';
import dotenv from 'dotenv';
import { registerCatalogRoutes } from './core/catalogs.js';

dotenv.config();

const app = express();
app.use(express.json());

// Lecturas permitidas (GET /:organizationId/<catalogo>) y los filtros que se reenvían a la API.
export const CATALOGS = {
    clientes: [],
    proyectos: [],
    abogados: [],
    tiempos: ['proyecto_id', 'abogado_id', 'liberado', 'facturado', 'prebill_id', 'facturable', 'tarea_estandar_id', 'books_estado'],
    gastos: ['proyecto_id', 'liberado', 'facturado', 'prebill_id', 'categoria_id', 'facturable', 'abogado_id', 'pagado_por', 'reembolso_estado'],
    'cargos-fijos': ['proyecto_id', 'liberado', 'facturado', 'prebill_id'],
};
registerCatalogRoutes(app, CATALOGS);

// Sin `stage` a propósito: un 404 con `stage` significa "el registro ya no existe".
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada en aptus_overview_services.' }));

export default app;
