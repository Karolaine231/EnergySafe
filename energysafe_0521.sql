--
-- PostgreSQL database dump
--


-- Dumped from database version 18.3 (Debian 18.3-1.pgdg12+1)
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.tarifas DROP CONSTRAINT IF EXISTS tarifas_local_id_fkey;
ALTER TABLE IF EXISTS ONLY public.rateio DROP CONSTRAINT IF EXISTS rateio_fatura_id_fkey;
ALTER TABLE IF EXISTS ONLY public.rateio DROP CONSTRAINT IF EXISTS rateio_area_id_fkey;
ALTER TABLE IF EXISTS ONLY public.quadros DROP CONSTRAINT IF EXISTS quadros_quadro_pai_id_fkey;
ALTER TABLE IF EXISTS ONLY public.quadros DROP CONSTRAINT IF EXISTS quadros_local_id_fkey;
ALTER TABLE IF EXISTS ONLY public.quadros DROP CONSTRAINT IF EXISTS quadros_area_id_fkey;
ALTER TABLE IF EXISTS ONLY public.metas DROP CONSTRAINT IF EXISTS metas_quadro_id_fkey;
ALTER TABLE IF EXISTS ONLY public.metas DROP CONSTRAINT IF EXISTS metas_local_id_fkey;
ALTER TABLE IF EXISTS ONLY public.medicoes DROP CONSTRAINT IF EXISTS medicoes_canal_id_fkey;
ALTER TABLE IF EXISTS ONLY public.faturas_ocr DROP CONSTRAINT IF EXISTS faturas_ocr_fatura_id_fkey;
ALTER TABLE IF EXISTS ONLY public.faturas DROP CONSTRAINT IF EXISTS faturas_local_id_fkey;
ALTER TABLE IF EXISTS ONLY public.faturas DROP CONSTRAINT IF EXISTS faturas_instalacao_id_fkey;
ALTER TABLE IF EXISTS ONLY public.fatura_itens DROP CONSTRAINT IF EXISTS fatura_itens_fatura_id_fkey;
ALTER TABLE IF EXISTS ONLY public.enel_instalacoes DROP CONSTRAINT IF EXISTS enel_instalacoes_local_id_fkey;
ALTER TABLE IF EXISTS ONLY public.dispositivos_status DROP CONSTRAINT IF EXISTS dispositivos_status_dispositivo_id_fkey;
ALTER TABLE IF EXISTS ONLY public.dispositivos DROP CONSTRAINT IF EXISTS dispositivos_quadro_id_fkey;
ALTER TABLE IF EXISTS ONLY public.consumo_diario DROP CONSTRAINT IF EXISTS consumo_diario_canal_id_fkey;
ALTER TABLE IF EXISTS ONLY public.canais_medicao DROP CONSTRAINT IF EXISTS canais_medicao_dispositivo_id_fkey;
ALTER TABLE IF EXISTS ONLY public.areas DROP CONSTRAINT IF EXISTS areas_local_id_fkey;
ALTER TABLE IF EXISTS ONLY public.alertas DROP CONSTRAINT IF EXISTS alertas_canal_id_fkey;
DROP TRIGGER IF EXISTS trg_faturas_ocr_atualizado_em ON public.faturas_ocr;
DROP TRIGGER IF EXISTS trg_faturas_atualizado_em ON public.faturas;
DROP TRIGGER IF EXISTS trg_enel_inst_atualizado_em ON public.enel_instalacoes;
DROP INDEX IF EXISTS public.idx_tarifas_local;
DROP INDEX IF EXISTS public.idx_medicoes_timestamp;
DROP INDEX IF EXISTS public.idx_medicoes_canal;
DROP INDEX IF EXISTS public.idx_faturas_vencimento;
DROP INDEX IF EXISTS public.idx_faturas_status;
DROP INDEX IF EXISTS public.idx_faturas_ocr_fatura;
DROP INDEX IF EXISTS public.idx_fatura_itens_fatura;
DROP INDEX IF EXISTS public.idx_enel_inst_local;
DROP INDEX IF EXISTS public.idx_consumo_diario_data;
DROP INDEX IF EXISTS public.idx_alertas_timestamp;
ALTER TABLE IF EXISTS ONLY public.tarifas DROP CONSTRAINT IF EXISTS tarifas_pkey;
ALTER TABLE IF EXISTS ONLY public.tarifas DROP CONSTRAINT IF EXISTS tarifas_local_id_vigencia_key;
ALTER TABLE IF EXISTS ONLY public.rateio DROP CONSTRAINT IF EXISTS rateio_pkey;
ALTER TABLE IF EXISTS ONLY public.rateio DROP CONSTRAINT IF EXISTS rateio_fatura_id_area_id_key;
ALTER TABLE IF EXISTS ONLY public.quadros DROP CONSTRAINT IF EXISTS quadros_pkey;
ALTER TABLE IF EXISTS ONLY public.metas DROP CONSTRAINT IF EXISTS metas_pkey;
ALTER TABLE IF EXISTS ONLY public.medicoes DROP CONSTRAINT IF EXISTS medicoes_pkey;
ALTER TABLE IF EXISTS ONLY public.locais DROP CONSTRAINT IF EXISTS locais_pkey;
ALTER TABLE IF EXISTS ONLY public.faturas DROP CONSTRAINT IF EXISTS faturas_pkey;
ALTER TABLE IF EXISTS ONLY public.faturas_ocr DROP CONSTRAINT IF EXISTS faturas_ocr_pkey;
ALTER TABLE IF EXISTS ONLY public.faturas_ocr DROP CONSTRAINT IF EXISTS faturas_ocr_fatura_id_key;
ALTER TABLE IF EXISTS ONLY public.faturas DROP CONSTRAINT IF EXISTS faturas_local_id_mes_key;
ALTER TABLE IF EXISTS ONLY public.fatura_itens DROP CONSTRAINT IF EXISTS fatura_itens_pkey;
ALTER TABLE IF EXISTS ONLY public.enel_instalacoes DROP CONSTRAINT IF EXISTS enel_instalacoes_pkey;
ALTER TABLE IF EXISTS ONLY public.enel_instalacoes DROP CONSTRAINT IF EXISTS enel_instalacoes_local_id_numero_key;
ALTER TABLE IF EXISTS ONLY public.dispositivos_status DROP CONSTRAINT IF EXISTS dispositivos_status_pkey;
ALTER TABLE IF EXISTS ONLY public.dispositivos_status DROP CONSTRAINT IF EXISTS dispositivos_status_dispositivo_id_key;
ALTER TABLE IF EXISTS ONLY public.dispositivos DROP CONSTRAINT IF EXISTS dispositivos_pkey;
ALTER TABLE IF EXISTS ONLY public.consumo_diario DROP CONSTRAINT IF EXISTS consumo_diario_pkey;
ALTER TABLE IF EXISTS ONLY public.consumo_diario DROP CONSTRAINT IF EXISTS consumo_diario_canal_id_data_key;
ALTER TABLE IF EXISTS ONLY public.canais_medicao DROP CONSTRAINT IF EXISTS canais_medicao_pkey;
ALTER TABLE IF EXISTS ONLY public.areas DROP CONSTRAINT IF EXISTS areas_pkey;
ALTER TABLE IF EXISTS ONLY public.alertas DROP CONSTRAINT IF EXISTS alertas_pkey;
ALTER TABLE IF EXISTS public.tarifas ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.rateio ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.quadros ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.metas ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.medicoes ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.locais ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.faturas_ocr ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.faturas ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.fatura_itens ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.enel_instalacoes ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.dispositivos_status ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.dispositivos ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.consumo_diario ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.canais_medicao ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.areas ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.alertas ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.tarifas_id_seq;
DROP TABLE IF EXISTS public.tarifas;
DROP SEQUENCE IF EXISTS public.rateio_id_seq;
DROP TABLE IF EXISTS public.rateio;
DROP SEQUENCE IF EXISTS public.quadros_id_seq;
DROP TABLE IF EXISTS public.quadros;
DROP SEQUENCE IF EXISTS public.metas_id_seq;
DROP TABLE IF EXISTS public.metas;
DROP SEQUENCE IF EXISTS public.medicoes_id_seq;
DROP TABLE IF EXISTS public.medicoes;
DROP SEQUENCE IF EXISTS public.locais_id_seq;
DROP TABLE IF EXISTS public.locais;
DROP SEQUENCE IF EXISTS public.faturas_ocr_id_seq;
DROP TABLE IF EXISTS public.faturas_ocr;
DROP SEQUENCE IF EXISTS public.faturas_id_seq;
DROP TABLE IF EXISTS public.faturas;
DROP SEQUENCE IF EXISTS public.fatura_itens_id_seq;
DROP TABLE IF EXISTS public.fatura_itens;
DROP SEQUENCE IF EXISTS public.enel_instalacoes_id_seq;
DROP TABLE IF EXISTS public.enel_instalacoes;
DROP SEQUENCE IF EXISTS public.dispositivos_status_id_seq;
DROP TABLE IF EXISTS public.dispositivos_status;
DROP SEQUENCE IF EXISTS public.dispositivos_id_seq;
DROP TABLE IF EXISTS public.dispositivos;
DROP SEQUENCE IF EXISTS public.consumo_diario_id_seq;
DROP TABLE IF EXISTS public.consumo_diario;
DROP SEQUENCE IF EXISTS public.canais_medicao_id_seq;
DROP TABLE IF EXISTS public.canais_medicao;
DROP SEQUENCE IF EXISTS public.areas_id_seq;
DROP TABLE IF EXISTS public.areas;
DROP SEQUENCE IF EXISTS public.alertas_id_seq;
DROP TABLE IF EXISTS public.alertas;
DROP FUNCTION IF EXISTS public.set_atualizado_em();
-- *not* dropping schema, since initdb creates it
--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: set_atualizado_em(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_atualizado_em() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.atualizado_em = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alertas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alertas (
    id integer NOT NULL,
    canal_id integer,
    tipo text,
    nivel text,
    mensagem text,
    valor real,
    limite real,
    "timestamp" timestamp without time zone NOT NULL,
    resolvido boolean DEFAULT false,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: alertas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alertas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alertas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alertas_id_seq OWNED BY public.alertas.id;


--
-- Name: areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.areas (
    id integer NOT NULL,
    nome text NOT NULL,
    local_id integer,
    descricao text
);


--
-- Name: areas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.areas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: areas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.areas_id_seq OWNED BY public.areas.id;


--
-- Name: canais_medicao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.canais_medicao (
    id integer NOT NULL,
    dispositivo_id integer,
    fase text,
    tipo text,
    descricao text,
    CONSTRAINT canais_medicao_fase_check CHECK ((fase = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])))
);


--
-- Name: canais_medicao_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.canais_medicao_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: canais_medicao_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.canais_medicao_id_seq OWNED BY public.canais_medicao.id;


--
-- Name: consumo_diario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consumo_diario (
    id bigint NOT NULL,
    canal_id integer,
    data date NOT NULL,
    kwh real NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: consumo_diario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.consumo_diario_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: consumo_diario_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.consumo_diario_id_seq OWNED BY public.consumo_diario.id;


--
-- Name: dispositivos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispositivos (
    id integer NOT NULL,
    nome text NOT NULL,
    quadro_id integer,
    ativo boolean DEFAULT true,
    data_instalacao timestamp without time zone,
    observacoes text
);


--
-- Name: dispositivos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dispositivos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dispositivos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dispositivos_id_seq OWNED BY public.dispositivos.id;


--
-- Name: dispositivos_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dispositivos_status (
    id integer NOT NULL,
    dispositivo_id integer,
    status text,
    ultima_leitura timestamp without time zone,
    potencia_atual real,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dispositivos_status_status_check CHECK ((status = ANY (ARRAY['ONLINE'::text, 'ATRASO'::text, 'OFFLINE'::text])))
);


--
-- Name: dispositivos_status_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.dispositivos_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: dispositivos_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.dispositivos_status_id_seq OWNED BY public.dispositivos_status.id;


--
-- Name: enel_instalacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enel_instalacoes (
    id integer NOT NULL,
    local_id integer NOT NULL,
    numero text NOT NULL,
    titular text,
    endereco text,
    lista_raw jsonb,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE enel_instalacoes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.enel_instalacoes IS 'Instalações Enel vinculadas a cada local';


--
-- Name: COLUMN enel_instalacoes.numero; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.enel_instalacoes.numero IS 'Número da instalação Enel (ex: 7006123456)';


--
-- Name: COLUMN enel_instalacoes.lista_raw; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.enel_instalacoes.lista_raw IS 'Array completo de instalações do login — para referência';


--
-- Name: enel_instalacoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.enel_instalacoes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: enel_instalacoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.enel_instalacoes_id_seq OWNED BY public.enel_instalacoes.id;


--
-- Name: fatura_itens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fatura_itens (
    id integer NOT NULL,
    fatura_id integer NOT NULL,
    descricao text NOT NULL,
    valor numeric(10,2) NOT NULL
);


--
-- Name: TABLE fatura_itens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.fatura_itens IS 'Itens de composição da fatura (ocr.itens_fatura)';


--
-- Name: fatura_itens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fatura_itens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fatura_itens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fatura_itens_id_seq OWNED BY public.fatura_itens.id;


--
-- Name: faturas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faturas (
    id integer NOT NULL,
    local_id integer,
    mes date NOT NULL,
    valor_total numeric(10,2) NOT NULL,
    kwh_total numeric(10,3),
    descricao text,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    instalacao_id integer,
    vencimento date,
    status text,
    codigo_barras text,
    conta_pdf_url text,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: COLUMN faturas.valor_total; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faturas.valor_total IS 'R$ total da fatura — NUMERIC para evitar erro de ponto flutuante';


--
-- Name: COLUMN faturas.kwh_total; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faturas.kwh_total IS 'kWh da fatura (para conferência com o medido)';


--
-- Name: COLUMN faturas.instalacao_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faturas.instalacao_id IS 'FK para enel_instalacoes — nullable, faturas manuais não precisam preencher';


--
-- Name: COLUMN faturas.vencimento; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faturas.vencimento IS 'Data de vencimento da fatura Enel';


--
-- Name: COLUMN faturas.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faturas.status IS 'Status retornado pelo serviço: em aberto | pago | vencido';


--
-- Name: faturas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.faturas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: faturas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.faturas_id_seq OWNED BY public.faturas.id;


--
-- Name: faturas_ocr; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faturas_ocr (
    id integer NOT NULL,
    fatura_id integer NOT NULL,
    cliente text,
    distribuidora text,
    nota_fiscal text,
    aviso text,
    endereco text,
    codigo_barras text,
    classe text,
    subclasse text,
    grupo text,
    subgrupo text,
    ref_mes smallint,
    ref_ano smallint,
    emissao_data date,
    data_apresentacao date,
    leitura_anterior_data date,
    leitura_data date,
    leitura_proxima_data date,
    energia_kwh numeric(10,3),
    valor numeric(10,2),
    vencimento date,
    preco_te numeric(10,6),
    preco_tusd numeric(10,6),
    normalizado_preco_te numeric(10,6),
    normalizado_preco_tusd numeric(10,6),
    normalizado_valor numeric(10,2),
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    atualizado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE faturas_ocr; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.faturas_ocr IS 'Dados extraídos por OCR do PDF da fatura Enel — 1-para-1 com faturas';


--
-- Name: COLUMN faturas_ocr.energia_kwh; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faturas_ocr.energia_kwh IS 'Consumo total em kWh extraído do PDF';


--
-- Name: COLUMN faturas_ocr.preco_te; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faturas_ocr.preco_te IS 'Tarifa de Energia (TE) em R$/kWh';


--
-- Name: COLUMN faturas_ocr.preco_tusd; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.faturas_ocr.preco_tusd IS 'Tarifa de Uso do Sistema de Distribuição em R$/kWh';


--
-- Name: faturas_ocr_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.faturas_ocr_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: faturas_ocr_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.faturas_ocr_id_seq OWNED BY public.faturas_ocr.id;


--
-- Name: locais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locais (
    id integer NOT NULL,
    nome text NOT NULL,
    andar integer,
    descricao text
);


--
-- Name: locais_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.locais_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: locais_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.locais_id_seq OWNED BY public.locais.id;


--
-- Name: medicoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medicoes (
    id bigint NOT NULL,
    "timestamp" timestamp without time zone NOT NULL,
    canal_id integer,
    corrente real,
    tensao real,
    potencia real,
    valido boolean DEFAULT true,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    potencia_ativa double precision,
    potencia_aparente double precision,
    potencia_reativa double precision,
    fator_potencia double precision
);


--
-- Name: medicoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medicoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medicoes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medicoes_id_seq OWNED BY public.medicoes.id;


--
-- Name: metas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metas (
    id integer NOT NULL,
    local_id integer,
    quadro_id integer,
    descricao text,
    kwh_baseline real NOT NULL,
    kwh_meta real NOT NULL,
    data_inicio date NOT NULL,
    data_fim date,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: metas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.metas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: metas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.metas_id_seq OWNED BY public.metas.id;


--
-- Name: quadros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quadros (
    id integer NOT NULL,
    nome text NOT NULL,
    local_id integer,
    area_id integer,
    quadro_pai_id integer,
    descricao text
);


--
-- Name: quadros_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quadros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quadros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quadros_id_seq OWNED BY public.quadros.id;


--
-- Name: rateio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rateio (
    id bigint NOT NULL,
    fatura_id integer,
    area_id integer,
    kwh real NOT NULL,
    percentual real NOT NULL,
    valor_rs real NOT NULL,
    gerado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: rateio_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rateio_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rateio_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rateio_id_seq OWNED BY public.rateio.id;


--
-- Name: tarifas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tarifas (
    id integer NOT NULL,
    local_id integer,
    valor_kwh real NOT NULL,
    vigencia date NOT NULL,
    descricao text,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tarifas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tarifas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tarifas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tarifas_id_seq OWNED BY public.tarifas.id;


--
-- Name: alertas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas ALTER COLUMN id SET DEFAULT nextval('public.alertas_id_seq'::regclass);


--
-- Name: areas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas ALTER COLUMN id SET DEFAULT nextval('public.areas_id_seq'::regclass);


--
-- Name: canais_medicao id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canais_medicao ALTER COLUMN id SET DEFAULT nextval('public.canais_medicao_id_seq'::regclass);


--
-- Name: consumo_diario id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumo_diario ALTER COLUMN id SET DEFAULT nextval('public.consumo_diario_id_seq'::regclass);


--
-- Name: dispositivos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispositivos ALTER COLUMN id SET DEFAULT nextval('public.dispositivos_id_seq'::regclass);


--
-- Name: dispositivos_status id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispositivos_status ALTER COLUMN id SET DEFAULT nextval('public.dispositivos_status_id_seq'::regclass);


--
-- Name: enel_instalacoes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enel_instalacoes ALTER COLUMN id SET DEFAULT nextval('public.enel_instalacoes_id_seq'::regclass);


--
-- Name: fatura_itens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fatura_itens ALTER COLUMN id SET DEFAULT nextval('public.fatura_itens_id_seq'::regclass);


--
-- Name: faturas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas ALTER COLUMN id SET DEFAULT nextval('public.faturas_id_seq'::regclass);


--
-- Name: faturas_ocr id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas_ocr ALTER COLUMN id SET DEFAULT nextval('public.faturas_ocr_id_seq'::regclass);


--
-- Name: locais id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locais ALTER COLUMN id SET DEFAULT nextval('public.locais_id_seq'::regclass);


--
-- Name: medicoes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicoes ALTER COLUMN id SET DEFAULT nextval('public.medicoes_id_seq'::regclass);


--
-- Name: metas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas ALTER COLUMN id SET DEFAULT nextval('public.metas_id_seq'::regclass);


--
-- Name: quadros id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quadros ALTER COLUMN id SET DEFAULT nextval('public.quadros_id_seq'::regclass);


--
-- Name: rateio id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rateio ALTER COLUMN id SET DEFAULT nextval('public.rateio_id_seq'::regclass);


--
-- Name: tarifas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarifas ALTER COLUMN id SET DEFAULT nextval('public.tarifas_id_seq'::regclass);


--
-- Data for Name: alertas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.alertas (id, canal_id, tipo, nivel, mensagem, valor, limite, "timestamp", resolvido, criado_em) FROM stdin;
5	4	queda_brusca	critico	Queda brusca 1 Andar - Fase A historico	0.3	22	2026-02-19 10:45:00	t	2026-05-08 00:01:30.692008
\.


--
-- Data for Name: areas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.areas (id, nome, local_id, descricao) FROM stdin;
1	Terreo ADM	2	Salas de Aula - Andar 0
\.


--
-- Data for Name: canais_medicao; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.canais_medicao (id, dispositivo_id, fase, tipo, descricao) FROM stdin;
1	1	A	corrente	ADM0_A307 Fase A
\.


--
-- Data for Name: consumo_diario; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.consumo_diario (id, canal_id, data, kwh, criado_em) FROM stdin;
1	7	2026-01-06	78.406	2026-05-08 00:01:30.431565
\.


--
-- Data for Name: dispositivos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dispositivos (id, nome, quadro_id, ativo, data_instalacao, observacoes) FROM stdin;
1	ESP32_ADM0_A307	1	t	2025-01-10 08:00:00	\N
\.


--
-- Data for Name: dispositivos_status; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dispositivos_status (id, dispositivo_id, status, ultima_leitura, potencia_atual, atualizado_em) FROM stdin;
4	4	ONLINE	2026-03-31 23:30:00	792.9	2026-05-08 00:01:31.132698
\.


--
-- Data for Name: enel_instalacoes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.enel_instalacoes (id, local_id, numero, titular, endereco, lista_raw, criado_em, atualizado_em) FROM stdin;
1	1	7006000001	Razão Social Exemplo	Rua Exemplo, 100 - SP	[]	2026-01-01 00:00:00	2026-01-01 00:00:00
\.


--
-- Data for Name: fatura_itens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.fatura_itens (id, fatura_id, descricao, valor) FROM stdin;
1	1	Energia Elétrica	850.00
\.


--
-- Data for Name: faturas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.faturas (id, local_id, mes, valor_total, kwh_total, descricao, criado_em, instalacao_id, vencimento, status, codigo_barras, conta_pdf_url, atualizado_em) FROM stdin;
1	1	2026-01-01	133984.00	190661.000	Fatura Enel 01/2026 - Bandeira Amarela - NF 000029364	2026-05-08 00:01:25.658288	\N	\N	\N	\N	\N	2026-05-16 13:59:15.568543
\.


--
-- Data for Name: faturas_ocr; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.faturas_ocr (id, fatura_id, cliente, distribuidora, nota_fiscal, aviso, endereco, codigo_barras, classe, subclasse, grupo, subgrupo, ref_mes, ref_ano, emissao_data, data_apresentacao, leitura_anterior_data, leitura_data, leitura_proxima_data, energia_kwh, valor, vencimento, preco_te, preco_tusd, normalizado_preco_te, normalizado_preco_tusd, normalizado_valor, criado_em, atualizado_em) FROM stdin;
1	1	Cliente Exemplo	Enel SP	000000001	\N	Rua Exemplo, 100	00000.00000 00000.000000 00000.000000 0 00000000000000	B3	\N	A4	SUBGRUPO	1	2026	2026-01-01	2026-01-01	2025-12-01	2026-01-01	2026-02-01	1000.000	850.00	2026-02-10	0.554320	0.252180	0.554320	0.252180	850.00	2026-01-01 00:00:00	2026-01-01 00:00:00
\.


--
-- Data for Name: locais; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.locais (id, nome, andar, descricao) FROM stdin;
1	Geral	0	P/ Faturas
\.


--
-- Data for Name: medicoes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.medicoes (id, "timestamp", canal_id, corrente, tensao, potencia, valido, criado_em, potencia_ativa, potencia_aparente, potencia_reativa, fator_potencia) FROM stdin;
1	2026-01-01 00:00:00	1	1.62	220	292.6	t	2026-05-08 00:01:27.547131	\N	\N	\N	\N
\.


--
-- Data for Name: metas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.metas (id, local_id, quadro_id, descricao, kwh_baseline, kwh_meta, data_inicio, data_fim, criado_em) FROM stdin;
1	2	1	Reducao 10% Terreo ADM Q1/26	1200	1080	2026-01-01	2026-03-31	2026-05-08 00:01:31.351496
\.


--
-- Data for Name: quadros; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.quadros (id, nome, local_id, area_id, quadro_pai_id, descricao) FROM stdin;
1	QLT-307	2	1	\N	Quadro principal - Terreo ADM
\.


--
-- Data for Name: rateio; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rateio (id, fatura_id, area_id, kwh, percentual, valor_rs, gerado_em) FROM stdin;
1	3	1	1258.7	0.72	893.51	2026-05-08 00:01:30.908358
\.


--
-- Data for Name: tarifas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tarifas (id, local_id, valor_kwh, vigencia, descricao, criado_em) FROM stdin;
1	1	0.8065	2026-01-01	Tarifa exemplo Q1/2026	2026-01-01 00:00:00
\.


--
-- Name: alertas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.alertas_id_seq', 17, true);


--
-- Name: areas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.areas_id_seq', 3, true);


--
-- Name: canais_medicao_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.canais_medicao_id_seq', 9, true);


--
-- Name: consumo_diario_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.consumo_diario_id_seq', 270, true);


--
-- Name: dispositivos_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.dispositivos_id_seq', 9, true);


--
-- Name: dispositivos_status_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.dispositivos_status_id_seq', 9, true);


--
-- Name: enel_instalacoes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.enel_instalacoes_id_seq', 1, false);


--
-- Name: fatura_itens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.fatura_itens_id_seq', 1, false);


--
-- Name: faturas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.faturas_id_seq', 3, true);


--
-- Name: faturas_ocr_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.faturas_ocr_id_seq', 1, false);


--
-- Name: locais_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.locais_id_seq', 4, true);


--
-- Name: medicoes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.medicoes_id_seq', 13100, true);


--
-- Name: metas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.metas_id_seq', 3, true);


--
-- Name: quadros_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.quadros_id_seq', 3, true);


--
-- Name: rateio_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.rateio_id_seq', 3, true);


--
-- Name: tarifas_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tarifas_id_seq', 4, true);


--
-- Name: alertas alertas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas
    ADD CONSTRAINT alertas_pkey PRIMARY KEY (id);


--
-- Name: areas areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_pkey PRIMARY KEY (id);


--
-- Name: canais_medicao canais_medicao_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canais_medicao
    ADD CONSTRAINT canais_medicao_pkey PRIMARY KEY (id);


--
-- Name: consumo_diario consumo_diario_canal_id_data_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumo_diario
    ADD CONSTRAINT consumo_diario_canal_id_data_key UNIQUE (canal_id, data);


--
-- Name: consumo_diario consumo_diario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumo_diario
    ADD CONSTRAINT consumo_diario_pkey PRIMARY KEY (id);


--
-- Name: dispositivos dispositivos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispositivos
    ADD CONSTRAINT dispositivos_pkey PRIMARY KEY (id);


--
-- Name: dispositivos_status dispositivos_status_dispositivo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispositivos_status
    ADD CONSTRAINT dispositivos_status_dispositivo_id_key UNIQUE (dispositivo_id);


--
-- Name: dispositivos_status dispositivos_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispositivos_status
    ADD CONSTRAINT dispositivos_status_pkey PRIMARY KEY (id);


--
-- Name: enel_instalacoes enel_instalacoes_local_id_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enel_instalacoes
    ADD CONSTRAINT enel_instalacoes_local_id_numero_key UNIQUE (local_id, numero);


--
-- Name: enel_instalacoes enel_instalacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enel_instalacoes
    ADD CONSTRAINT enel_instalacoes_pkey PRIMARY KEY (id);


--
-- Name: fatura_itens fatura_itens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fatura_itens
    ADD CONSTRAINT fatura_itens_pkey PRIMARY KEY (id);


--
-- Name: faturas faturas_local_id_mes_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas
    ADD CONSTRAINT faturas_local_id_mes_key UNIQUE (local_id, mes);


--
-- Name: faturas_ocr faturas_ocr_fatura_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas_ocr
    ADD CONSTRAINT faturas_ocr_fatura_id_key UNIQUE (fatura_id);


--
-- Name: faturas_ocr faturas_ocr_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas_ocr
    ADD CONSTRAINT faturas_ocr_pkey PRIMARY KEY (id);


--
-- Name: faturas faturas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas
    ADD CONSTRAINT faturas_pkey PRIMARY KEY (id);


--
-- Name: locais locais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locais
    ADD CONSTRAINT locais_pkey PRIMARY KEY (id);


--
-- Name: medicoes medicoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicoes
    ADD CONSTRAINT medicoes_pkey PRIMARY KEY (id);


--
-- Name: metas metas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas
    ADD CONSTRAINT metas_pkey PRIMARY KEY (id);


--
-- Name: quadros quadros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quadros
    ADD CONSTRAINT quadros_pkey PRIMARY KEY (id);


--
-- Name: rateio rateio_fatura_id_area_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rateio
    ADD CONSTRAINT rateio_fatura_id_area_id_key UNIQUE (fatura_id, area_id);


--
-- Name: rateio rateio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rateio
    ADD CONSTRAINT rateio_pkey PRIMARY KEY (id);


--
-- Name: tarifas tarifas_local_id_vigencia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarifas
    ADD CONSTRAINT tarifas_local_id_vigencia_key UNIQUE (local_id, vigencia);


--
-- Name: tarifas tarifas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarifas
    ADD CONSTRAINT tarifas_pkey PRIMARY KEY (id);


--
-- Name: idx_alertas_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alertas_timestamp ON public.alertas USING btree ("timestamp");


--
-- Name: idx_consumo_diario_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consumo_diario_data ON public.consumo_diario USING btree (canal_id, data);


--
-- Name: idx_enel_inst_local; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enel_inst_local ON public.enel_instalacoes USING btree (local_id);


--
-- Name: idx_fatura_itens_fatura; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fatura_itens_fatura ON public.fatura_itens USING btree (fatura_id);


--
-- Name: idx_faturas_ocr_fatura; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faturas_ocr_fatura ON public.faturas_ocr USING btree (fatura_id);


--
-- Name: idx_faturas_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faturas_status ON public.faturas USING btree (status);


--
-- Name: idx_faturas_vencimento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faturas_vencimento ON public.faturas USING btree (vencimento);


--
-- Name: idx_medicoes_canal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medicoes_canal ON public.medicoes USING btree (canal_id);


--
-- Name: idx_medicoes_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medicoes_timestamp ON public.medicoes USING btree ("timestamp");


--
-- Name: idx_tarifas_local; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tarifas_local ON public.tarifas USING btree (local_id, vigencia);


--
-- Name: enel_instalacoes trg_enel_inst_atualizado_em; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enel_inst_atualizado_em BEFORE UPDATE ON public.enel_instalacoes FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();


--
-- Name: faturas trg_faturas_atualizado_em; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_faturas_atualizado_em BEFORE UPDATE ON public.faturas FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();


--
-- Name: faturas_ocr trg_faturas_ocr_atualizado_em; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_faturas_ocr_atualizado_em BEFORE UPDATE ON public.faturas_ocr FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();


--
-- Name: alertas alertas_canal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alertas
    ADD CONSTRAINT alertas_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES public.canais_medicao(id);


--
-- Name: areas areas_local_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.areas
    ADD CONSTRAINT areas_local_id_fkey FOREIGN KEY (local_id) REFERENCES public.locais(id);


--
-- Name: canais_medicao canais_medicao_dispositivo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.canais_medicao
    ADD CONSTRAINT canais_medicao_dispositivo_id_fkey FOREIGN KEY (dispositivo_id) REFERENCES public.dispositivos(id);


--
-- Name: consumo_diario consumo_diario_canal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consumo_diario
    ADD CONSTRAINT consumo_diario_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES public.canais_medicao(id);


--
-- Name: dispositivos dispositivos_quadro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispositivos
    ADD CONSTRAINT dispositivos_quadro_id_fkey FOREIGN KEY (quadro_id) REFERENCES public.quadros(id);


--
-- Name: dispositivos_status dispositivos_status_dispositivo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dispositivos_status
    ADD CONSTRAINT dispositivos_status_dispositivo_id_fkey FOREIGN KEY (dispositivo_id) REFERENCES public.dispositivos(id);


--
-- Name: enel_instalacoes enel_instalacoes_local_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enel_instalacoes
    ADD CONSTRAINT enel_instalacoes_local_id_fkey FOREIGN KEY (local_id) REFERENCES public.locais(id) ON DELETE CASCADE;


--
-- Name: fatura_itens fatura_itens_fatura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fatura_itens
    ADD CONSTRAINT fatura_itens_fatura_id_fkey FOREIGN KEY (fatura_id) REFERENCES public.faturas(id) ON DELETE CASCADE;


--
-- Name: faturas faturas_instalacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas
    ADD CONSTRAINT faturas_instalacao_id_fkey FOREIGN KEY (instalacao_id) REFERENCES public.enel_instalacoes(id) ON DELETE SET NULL;


--
-- Name: faturas faturas_local_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas
    ADD CONSTRAINT faturas_local_id_fkey FOREIGN KEY (local_id) REFERENCES public.locais(id);


--
-- Name: faturas_ocr faturas_ocr_fatura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faturas_ocr
    ADD CONSTRAINT faturas_ocr_fatura_id_fkey FOREIGN KEY (fatura_id) REFERENCES public.faturas(id) ON DELETE CASCADE;


--
-- Name: medicoes medicoes_canal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicoes
    ADD CONSTRAINT medicoes_canal_id_fkey FOREIGN KEY (canal_id) REFERENCES public.canais_medicao(id);


--
-- Name: metas metas_local_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas
    ADD CONSTRAINT metas_local_id_fkey FOREIGN KEY (local_id) REFERENCES public.locais(id);


--
-- Name: metas metas_quadro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metas
    ADD CONSTRAINT metas_quadro_id_fkey FOREIGN KEY (quadro_id) REFERENCES public.quadros(id);


--
-- Name: quadros quadros_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quadros
    ADD CONSTRAINT quadros_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id);


--
-- Name: quadros quadros_local_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quadros
    ADD CONSTRAINT quadros_local_id_fkey FOREIGN KEY (local_id) REFERENCES public.locais(id);


--
-- Name: quadros quadros_quadro_pai_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quadros
    ADD CONSTRAINT quadros_quadro_pai_id_fkey FOREIGN KEY (quadro_pai_id) REFERENCES public.quadros(id) ON DELETE SET NULL;


--
-- Name: rateio rateio_area_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rateio
    ADD CONSTRAINT rateio_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id);


--
-- Name: rateio rateio_fatura_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rateio
    ADD CONSTRAINT rateio_fatura_id_fkey FOREIGN KEY (fatura_id) REFERENCES public.faturas(id);


--
-- Name: tarifas tarifas_local_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tarifas
    ADD CONSTRAINT tarifas_local_id_fkey FOREIGN KEY (local_id) REFERENCES public.locais(id);


--
-- PostgreSQL database dump complete
--

\unrestrict rlBXYTeqcWdBrelrn2NLA2qEERxNrDl8ksKm1NJsaEuyOvd3iLaA6MHg3JTKV5l
