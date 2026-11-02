'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type Field = {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'date' | 'textarea' | 'json';
  required?: boolean;
  placeholder?: string;
  inPath?: boolean;
};
type Action = {
  label: string;
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  fields?: Field[];
  body?: (values: Record<string, string>, ids: Record<string, string>) => unknown;
};
type ExtraSource = { title: string; endpoint: string };
type ScreenConfig = {
  title: string;
  description: string;
  endpoint?: string;
  search?: boolean;
  actions?: Action[];
  links?: { label: string; href: string }[];
  extras?: ExtraSource[];
  staticContent?: 'help' | 'legal' | 'contact' | 'offline' | 'maintenance' | 'models' | 'team';
};
type ScreenData = { value?: unknown; error?: string; loading: boolean };
type RecordValue = Record<string, unknown>;

const clientLinks = [
  ['/client', 'Mes projets'],
  ['/client/notifications', 'Notifications'],
  ['/client/paiements', 'Paiements'],
  ['/client/profil', 'Profil'],
];
const providerLinks = [
  ['/prestataire', 'Tableau de bord'],
  ['/prestataire/offres', 'Offres'],
  ['/prestataire/agenda', 'Agenda'],
  ['/prestataire/portefeuille', 'Portefeuille'],
];
const commonLinks = [
  ['/activites', 'Activités'],
  ['/aide', 'Aide'],
  ['/connexion', 'Connexion'],
];

function field(name: string, label: string, type: Field['type'] = 'text', options: Partial<Field> = {}): Field {
  return { name, label, type, ...options };
}

const byPath: Record<string, ScreenConfig> = {
  '/': {
    title: 'Une activité. Toute l’équipe.',
    description: 'Trouvez les professionnels dont votre projet a besoin, réunis autour d’une même activité.',
    endpoint: '/activities',
    search: true,
    extras: [{ title: 'Secteurs', endpoint: '/sectors' }],
    links: [['/activites', 'Explorer les activités'], ['/connexion', 'Créer un projet'], ['/prestataire/onboarding', 'Devenir prestataire']],
  },
  '/activites': {
    title: 'Activités',
    description: 'Explorez le catalogue et recherchez une activité selon votre besoin.',
    endpoint: '/activities',
    search: true,
    links: [['/connexion', 'Démarrer un projet']],
  },
  '/activites/:id': {
    title: 'Fiche activité',
    description: 'Détails publiés du catalogue, estimation et configuration disponibles.',
    endpoint: '/activities/:id',
    extras: [{ title: 'Estimation indicative', endpoint: '/activities/:id/estimate' }],
    actions: [{ label: 'Louer cette activité', endpoint: '/projects', body: (values) => ({ activityVersionId: values.activityVersionId, ...(values.city ? { city: values.city } : {}), ...(values.targetDate ? { targetDate: values.targetDate } : {}) }), fields: [field('activityVersionId', 'Identifiant de la version publiée', 'text', { required: true }), field('city', 'Ville'), field('targetDate', 'Date souhaitée', 'date')] }],
    links: [['/connexion', 'Louer cette activité'], ['/activites', 'Retour au catalogue']],
  },
  '/connexion': {
    title: 'Connexion et inscription',
    description: 'Connectez-vous par e-mail ou demandez un code à usage unique sur votre téléphone.',
    actions: [
      { label: 'Se connecter', endpoint: '/auth/login', fields: [field('email', 'Adresse e-mail', 'email', { required: true }), field('password', 'Mot de passe', 'password', { required: true })] },
      { label: 'Demander un code OTP', endpoint: '/auth/otp/request', fields: [field('phone', 'Téléphone', 'text', { required: true }), field('channel', 'Canal (SMS ou WhatsApp)', 'text', { placeholder: 'SMS' })] },
      { label: 'Vérifier le code OTP', endpoint: '/auth/otp/verify', fields: [field('phone', 'Téléphone', 'text', { required: true }), field('code', 'Code reçu', 'text', { required: true }), field('type', 'Type de compte (C ou P)', 'text', { required: true })] },
      { label: 'Créer un compte', endpoint: '/auth/register', fields: [field('type', 'Type de compte (C ou P)', 'text', { required: true }), field('phone', 'Téléphone', 'text', { required: true }), field('email', 'Adresse e-mail', 'email'), field('displayName', 'Nom affiché', 'text', { required: true })] },
    ],
  },
  '/legal': { title: 'Informations légales', description: 'Les textes contractuels seront publiés ici avant toute souscription.', staticContent: 'legal' },
  '/aide': { title: 'Centre d’aide', description: 'Des réponses aux questions les plus fréquentes.', staticContent: 'help' },
  '/contact': { title: 'Nous contacter', description: 'Notre formulaire de contact n’est pas encore relié à un service d’envoi.', staticContent: 'contact' },
  '/hors-ligne': { title: 'Connexion interrompue', description: 'Vérifiez votre connexion, puis réessayez de charger les données.', staticContent: 'offline' },
  '/maintenance': { title: 'Service momentanément indisponible', description: 'Nous ne pouvons pas confirmer l’état des services pour le moment.', staticContent: 'maintenance' },
  '/prestataires/:id': {
    title: 'Profil prestataire',
    description: 'Profil public et avis disponibles depuis le service prestataires.',
    endpoint: '/providers/:id/public',
    extras: [{ title: 'Avis reçus', endpoint: '/providers/:id/reviews' }],
    links: [['/activites', 'Découvrir les activités']],
  },
  '/client': {
    title: 'Votre espace client',
    description: 'Retrouvez vos projets et leur avancement. Les informations affichées viennent de votre compte.',
    endpoint: '/projects',
    extras: [{ title: 'Notifications', endpoint: '/notifications' }],
    links: [['/activites', 'Créer un projet'], ['/client/paiements', 'Voir mes paiements']],
  },
  '/client/projets/:id': {
    title: 'Détail du projet',
    description: 'État du projet et chronologie communiqués par l’API.',
    endpoint: '/projects/:id',
    extras: [{ title: 'Chronologie', endpoint: '/projects/:id/timeline' }],
    links: [
      ['/client/projets/:id/configuration', 'Configuration'],
      ['/client/projets/:id/devis', 'Devis'],
      ['/client/projets/:id/equipe', 'Équipe'],
      ['/client/projets/:id/contrat', 'Contrat'],
      ['/client/projets/:id/paiement', 'Paiement'],
      ['/client/projets/:id/messages', 'Messages'],
      ['/client/projets/:id/evaluation', 'Évaluation'],
      ['/client/projets/:id/litige', 'Litige'],
      ['/client/projets/:id/annulation', 'Annulation'],
    ],
  },
  '/client/projets/:id/configuration': {
    title: 'Configuration du projet',
    description: 'Consultez le projet et enregistrez les réponses au questionnaire de configuration.',
    endpoint: '/projects/:id',
    actions: [{ label: 'Enregistrer les réponses', endpoint: '/projects/:id/answers', method: 'PATCH', fields: [field('answers', 'Réponses (objet JSON)', 'json', { required: true })], body: (v) => ({ answers: JSON.parse(v.answers) }) }],
  },
  '/client/projets/:id/devis': {
    title: 'Devis du projet',
    description: 'Consultez le dernier devis calculé ou demandez un nouveau calcul au serveur.',
    endpoint: '/projects/:id/quote',
    actions: [{ label: 'Calculer le devis', endpoint: '/projects/:id/quote', fields: [] }],
  },
  '/client/projets/:id/equipe': {
    title: 'Composition de l’équipe',
    description: 'Demandez des propositions de prestataires et consultez les résultats renvoyés par le matching.',
    endpoint: '/projects/:id',
    actions: [{ label: 'Proposer une équipe', endpoint: '/projects/:id/team/suggest', fields: [] }],
  },
  '/client/projets/:id/contrat': {
    title: 'Contrat et signature',
    description: 'Consultez le contrat du projet. La signature dépend de la validation du code demandé.',
    endpoint: '/projects/:id/contract',
    actions: [{ label: 'Signer le contrat', endpoint: '/contracts/:contractId/sign', fields: [field('contractId', 'Identifiant du contrat', 'text', { required: true, inPath: true }), field('code', 'Code OTP de signature', 'text', { required: true })], body: (v) => ({ code: v.code }) }],
  },
  '/client/projets/:id/paiement': {
    title: 'Paiement du projet',
    description: 'Demandez la création d’une intention de paiement. Le résultat dépend du service de paiement.',
    actions: [{ label: 'Créer une intention', endpoint: '/payments/intents', fields: [field('projectId', 'Identifiant du projet', 'text', { required: true }), field('amount', 'Montant', 'number', { required: true }), field('currency', 'Devise (code ISO)', 'text', { required: true }), field('operator', 'Moyen de paiement', 'text', { placeholder: 'Mobile Money ou carte' })], body: (v) => ({ projectId: v.projectId, amount: Number(v.amount), currency: v.currency, operator: v.operator }) }],
  },
  '/client/projets/:id/jalons/:milestoneId': {
    title: 'Validation du jalon',
    description: 'Consultez les preuves disponibles et transmettez votre décision au serveur.',
    endpoint: '/projects/:id/milestones',
    actions: [
      { label: 'Accepter le jalon', endpoint: '/milestones/:milestoneId/approve', fields: [] },
      { label: 'Contester le jalon', endpoint: '/milestones/:milestoneId/contest', fields: [field('reason', 'Motif de contestation', 'textarea', { required: true })] },
    ],
  },
  '/client/projets/:id/messages': {
    title: 'Messages du projet',
    description: 'Historique et envoi de messages dans le fil du projet.',
    endpoint: '/projects/:id/messages',
    actions: [{ label: 'Envoyer le message', endpoint: '/projects/:id/messages', fields: [field('content', 'Votre message', 'textarea', { required: true })] }],
  },
  '/client/projets/:id/evaluation': {
    title: 'Évaluer le projet',
    description: 'Transmettez votre avis sur la mission au service de réputation.',
    endpoint: '/projects/:id',
    actions: [{ label: 'Envoyer mon avis', endpoint: '/missions/:missionId/review', fields: [field('missionId', 'Identifiant de la mission', 'text', { required: true, inPath: true }), field('rating', 'Note sur 5', 'number', { required: true }), field('comment', 'Commentaire', 'textarea')] }],
  },
  '/client/projets/:id/litige': {
    title: 'Suivi du litige',
    description: 'Vous pouvez soumettre un dossier ou ajouter une preuve. La décision est rendue par le service de confiance.',
    actions: [
      { label: 'Ouvrir un litige', endpoint: '/disputes', fields: [field('projectId', 'Identifiant du projet', 'text', { required: true }), field('reason', 'Motif', 'text', { required: true }), field('description', 'Description', 'textarea', { required: true })] },
      { label: 'Ajouter une preuve', endpoint: '/disputes/:disputeId/evidence', fields: [field('disputeId', 'Identifiant du litige', 'text', { required: true, inPath: true }), field('url', 'Lien vers la preuve', 'text', { required: true }), field('description', 'Description de la preuve', 'textarea')] },
    ],
  },
  '/client/projets/:id/annulation': {
    title: 'Annulation du projet',
    description: 'Soumettez une demande d’annulation. Le serveur applique les conditions et calcule les conséquences.',
    endpoint: '/projects/:id',
    actions: [{ label: 'Demander l’annulation', endpoint: '/projects/:id/cancel', fields: [field('reason', 'Motif', 'textarea', { required: true })] }],
  },
  '/client/paiements': {
    title: 'Paiements et factures',
    description: 'Historique de vos transactions et factures disponibles.',
    endpoint: '/payments',
    extras: [{ title: 'Factures', endpoint: '/invoices' }],
  },
  '/client/profil': {
    title: 'Profil et préférences',
    description: 'Consultez votre profil et mettez à jour vos informations et préférences.',
    endpoint: '/me',
    actions: [
      { label: 'Enregistrer le profil', endpoint: '/me', method: 'PATCH', fields: [field('displayName', 'Nom affiché'), field('email', 'Adresse e-mail', 'email'), field('locale', 'Langue', 'text', { placeholder: 'fr' })] },
      { label: 'Enregistrer les préférences', endpoint: '/me/notification-preferences', method: 'PUT', fields: [field('email', 'Notifications par e-mail', 'text'), field('sms', 'Notifications par SMS', 'text'), field('locale', 'Langue', 'text', { placeholder: 'fr' })] },
    ],
  },
  '/client/notifications': {
    title: 'Notifications',
    description: 'Les notifications sont chargées depuis votre compte. Une action de lecture est transmise à l’API.',
    endpoint: '/notifications',
    actions: [{ label: 'Marquer comme lue', endpoint: '/notifications/:notificationId/read', fields: [field('notificationId', 'Identifiant de la notification', 'text', { required: true, inPath: true })] }],
  },
  '/client/modeles': { title: 'Projets réutilisables', description: 'La gestion des modèles de projet n’est pas exposée par l’API disponible.', staticContent: 'models' },
  '/prestataire': {
    title: 'Espace prestataire',
    description: 'Retrouvez les missions et les informations du portefeuille disponibles pour votre compte.',
    endpoint: '/missions',
    extras: [{ title: 'Portefeuille', endpoint: '/wallets/me' }],
    links: [['/prestataire/offres', 'Voir les offres'], ['/prestataire/agenda', 'Gérer mes disponibilités']],
  },
  '/prestataire/onboarding': {
    title: 'Bienvenue chez BIGBIIM',
    description: 'Créez votre profil prestataire. Le serveur confirmera la prise en compte du dossier.',
    actions: [{ label: 'Créer mon profil', endpoint: '/providers', fields: [field('displayName', 'Nom professionnel', 'text', { required: true }), field('description', 'Présentation', 'textarea', { required: true }), field('phone', 'Téléphone', 'text', { required: true })] }],
    extras: [{ title: 'Compétences disponibles', endpoint: '/skills' }],
  },
  '/prestataire/profil': {
    title: 'Mon profil public',
    description: 'Consultez et mettez à jour les informations renvoyées pour votre profil.',
    endpoint: '/me',
    actions: [{ label: 'Enregistrer les modifications', endpoint: '/providers/:providerId', method: 'PATCH', fields: [field('providerId', 'Identifiant prestataire', 'text', { required: true, inPath: true }), field('displayName', 'Nom professionnel'), field('description', 'Présentation', 'textarea')] }],
  },
  '/prestataire/verification': {
    title: 'Vérification du profil',
    description: 'Consultez votre statut et transmettez un justificatif au service de vérification.',
    endpoint: '/me',
    actions: [{ label: 'Déposer un justificatif', endpoint: '/providers/:providerId/documents', fields: [field('providerId', 'Identifiant prestataire', 'text', { required: true, inPath: true }), field('documentType', 'Type de justificatif', 'text', { required: true }), field('fileId', 'Identifiant du fichier déposé', 'text', { required: true })] }],
  },
  '/prestataire/offres': {
    title: 'Offres de mission',
    description: 'Consultez les offres reçues et transmettez votre réponse.',
    endpoint: '/missions',
    actions: [
      { label: 'Accepter une offre', endpoint: '/missions/:missionId/accept', fields: [field('missionId', 'Identifiant de mission', 'text', { required: true, inPath: true })] },
      { label: 'Refuser une offre', endpoint: '/missions/:missionId/decline', fields: [field('missionId', 'Identifiant de mission', 'text', { required: true, inPath: true }), field('reason', 'Motif', 'textarea', { required: true })] },
      { label: 'Faire une contre-proposition', endpoint: '/missions/:missionId/counter', fields: [field('missionId', 'Identifiant de mission', 'text', { required: true, inPath: true }), field('amount', 'Montant proposé', 'number', { required: true }), field('date', 'Date proposée', 'date', { required: true })], body: (v) => ({ amount: Number(v.amount), date: v.date }) },
    ],
  },
  '/prestataire/missions/:id': {
    title: 'Mission en cours',
    description: 'Consultez les détails et transmettez vos actions d’avancement.',
    endpoint: '/missions',
    actions: [
      { label: 'Démarrer la mission', endpoint: '/missions/:id/start', fields: [] },
      { label: 'Déclarer un avancement', endpoint: '/missions/:id/progress', fields: [field('description', 'Description de l’avancement', 'textarea', { required: true })] },
      { label: 'Déposer un livrable', endpoint: '/missions/:id/deliverables', fields: [field('name', 'Nom du livrable', 'text', { required: true }), field('url', 'Lien du fichier', 'text', { required: true })] },
    ],
  },
  '/prestataire/agenda': {
    title: 'Agenda et disponibilités',
    description: 'Consultez votre profil et enregistrez vos disponibilités auprès du serveur.',
    endpoint: '/me',
    actions: [{ label: 'Enregistrer mes disponibilités', endpoint: '/providers/:providerId/availability', method: 'PUT', fields: [field('providerId', 'Identifiant prestataire', 'text', { required: true, inPath: true }), field('availability', 'Disponibilités (objet JSON)', 'json', { required: true }), field('capacity', 'Capacité', 'number')] , body: (v) => ({ availability: JSON.parse(v.availability), capacity: Number(v.capacity) }) }],
  },
  '/prestataire/portefeuille': {
    title: 'Portefeuille et retraits',
    description: 'Consultez le solde renvoyé par le portefeuille et soumettez une demande de retrait.',
    endpoint: '/wallets/me',
    actions: [{ label: 'Demander un retrait', endpoint: '/wallets/me/payouts', fields: [field('amount', 'Montant du retrait', 'number', { required: true }), field('currency', 'Devise', 'text', { required: true }), field('operator', 'Opérateur de paiement', 'text', { required: true }), field('account', 'Compte de réception', 'text', { required: true })], body: (v) => ({ amount: Number(v.amount), currency: v.currency, operator: v.operator, account: v.account }) }],
  },
  '/prestataire/messages': {
    title: 'Messagerie prestataire',
    description: 'Chargez un fil à partir de son identifiant de projet et envoyez vos messages.',
    actions: [
      { label: 'Charger les messages', endpoint: '/projects/:projectId/messages', method: 'GET', fields: [field('projectId', 'Identifiant du projet', 'text', { required: true, inPath: true })] },
      { label: 'Envoyer un message', endpoint: '/projects/:projectId/messages', fields: [field('projectId', 'Identifiant du projet', 'text', { required: true, inPath: true }), field('content', 'Votre message', 'textarea', { required: true })] },
    ],
    links: [['/prestataire', 'Retour au tableau de bord']],
  },
  '/prestataire/avis': {
    title: 'Avis et réputation',
    description: 'Consultez les évaluations reçues sur votre profil public.',
    actions: [{ label: 'Charger les avis', endpoint: '/providers/:providerId/reviews', method: 'GET', fields: [field('providerId', 'Identifiant prestataire', 'text', { required: true, inPath: true })] }],
  },
  '/prestataire/litiges': {
    title: 'Litiges',
    description: 'Ajoutez une preuve à un dossier de litige existant.',
    actions: [{ label: 'Ajouter une preuve', endpoint: '/disputes/:disputeId/evidence', fields: [field('disputeId', 'Identifiant du litige', 'text', { required: true, inPath: true }), field('url', 'Lien vers la preuve', 'text', { required: true }), field('description', 'Description', 'textarea')] }],
  },
  '/prestataire/parametres': {
    title: 'Paramètres prestataire',
    description: 'Gérez les préférences de notification, votre zone et vos tarifs.',
    endpoint: '/me',
    actions: [
      { label: 'Enregistrer les préférences', endpoint: '/me/notification-preferences', method: 'PUT', fields: [field('locale', 'Langue', 'text', { placeholder: 'fr' }), field('email', 'Notifications e-mail'), field('sms', 'Notifications SMS')] },
      { label: 'Enregistrer les zones', endpoint: '/providers/:providerId/zones', method: 'PUT', fields: [field('providerId', 'Identifiant prestataire', 'text', { required: true, inPath: true }), field('zones', 'Zones (liste JSON)', 'json', { required: true })], body: (v) => ({ zones: JSON.parse(v.zones) }) },
      { label: 'Enregistrer les tarifs', endpoint: '/providers/:providerId/rates', method: 'PUT', fields: [field('providerId', 'Identifiant prestataire', 'text', { required: true, inPath: true }), field('rates', 'Tarifs (objet JSON)', 'json', { required: true })], body: (v) => ({ rates: JSON.parse(v.rates) }) },
    ],
  },
  '/prestataire/equipe': { title: 'Équipe et sous-traitants', description: 'La gestion de plusieurs membres sous un même compte est prévue en V2 et n’est pas exposée par l’API.', staticContent: 'team' },
};

function resolveScreen(pathname: string): ScreenConfig {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'client' && parts[1] === 'projets' && parts[2]) {
    if (parts[3] === 'jalons' && parts[4]) return byPath['/client/projets/:id/jalons/:milestoneId'];
    const key = `/client/projets/:id${parts[3] ? `/${parts[3]}` : ''}`;
    return byPath[key] ?? byPath['/client/projets/:id'];
  }
  if (parts[0] === 'prestataire' && parts[1] === 'missions' && parts[2]) return byPath['/prestataire/missions/:id'];
  if (parts[0] === 'activites' && parts[1]) return byPath['/activites/:id'];
  if (parts[0] === 'prestataires' && parts[1]) return byPath['/prestataires/:id'];
  return byPath[pathname] ?? {
    title: 'Espace BIGBIIM',
    description: 'Consultez les informations disponibles pour votre compte.',
  };
}

function interpolate(value: string, ids: Record<string, string>): string {
  return value.replace(/:([a-zA-Z]+)/g, (_, key: string) => encodeURIComponent(ids[key] ?? ''));
}

function getItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const record = value as RecordValue;
    if (Array.isArray(record.items)) return record.items;
    if (Array.isArray(record.data)) return record.data;
  }
  return value === undefined || value === null ? [] : [value];
}

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function translated(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const object = value as RecordValue;
    for (const key of ['fr', 'FR', 'fr-FR', 'label']) {
      if (typeof object[key] === 'string') return object[key] as string;
    }
    return Object.values(object).find((item): item is string => typeof item === 'string') ?? '';
  }
  return '';
}

function DataCards({ value, emptyMessage, linkBase }: { value: unknown; emptyMessage: string; linkBase?: string }) {
  const items = getItems(value);
  if (!items.length) return <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{emptyMessage}</p>;
  return (
    <div className="grid gap-3">
      {items.map((item, index) => {
        if (!item || typeof item !== 'object') {
          return <div key={index} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">{String(item)}</div>;
        }
        const record = item as RecordValue;
        const title = translated(record.name ?? record.title ?? record.label ?? record.nameI18n) || `Élément ${index + 1}`;
        const hidden = new Set(['name', 'title', 'label', 'nameI18n']);
        const entries = Object.entries(record).filter(([key, entry]) => !hidden.has(key) && entry !== null && entry !== undefined);
        return (
          <article key={String(record.id ?? index)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-semibold text-slate-900">{title}</h3>
            {linkBase && typeof record.id === 'string' && <Link href={interpolate(linkBase, { id: record.id })} className="mt-2 inline-flex text-sm font-semibold text-brand-blue underline underline-offset-2">Ouvrir</Link>}
            {entries.length > 0 && (
              <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {entries.map(([key, entry]) => (
                  <div key={key} className="min-w-0">
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{humanize(key)}</dt>
                    <dd className="mt-0.5 break-words text-sm text-slate-800">
                      {typeof entry === 'object' ? translated(entry) || JSON.stringify(entry) : String(entry)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </article>
        );
      })}
    </div>
  );
}

function StaticContent({ kind }: { kind?: ScreenConfig['staticContent'] }) {
  if (kind === 'help') return <div className="grid gap-3">{[
    ['Comment démarrer un projet ?', 'Choisissez une activité du catalogue et connectez-vous pour lancer votre projet.'],
    ['Comment suivre une mission ?', 'Retrouvez le statut et les échanges dans le détail du projet.'],
    ['Comment contacter un prestataire ?', 'Utilisez la messagerie liée au projet pour conserver les échanges au même endroit.'],
  ].map(([question, answer]) => <details key={question} className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-medium">{question}</summary><p className="mt-2 text-sm text-slate-600">{answer}</p></details>)}</div>;
  const content: Record<string, { heading: string; body: string }> = {
    legal: { heading: 'Documents contractuels', body: 'Les conditions générales et la politique de confidentialité ne sont pas encore publiées dans cette application. Aucune souscription n’est proposée depuis cette page.' },
    contact: { heading: 'Formulaire indisponible', body: 'Aucun service d’envoi de contact n’est connecté. Vous pouvez consulter le centre d’aide ou revenir lorsque le service sera disponible.' },
    offline: { heading: 'Mode hors connexion', body: 'Les données de compte et les actions nécessitent une connexion. Vos changements ne sont pas enregistrés hors ligne.' },
    maintenance: { heading: 'État du service inconnu', body: 'Cette page ne peut pas vérifier l’état de maintenance auprès d’un service. Réessayez plus tard ou consultez la page d’aide.' },
    models: { heading: 'Fonctionnalité non disponible', body: 'La gestion des projets favoris et des modèles réutilisables n’est pas encore proposée par l’API.' },
    team: { heading: 'Fonctionnalité prévue en V2', body: 'La gestion de plusieurs membres sous un compte prestataire n’est pas encore disponible.' },
  };
  const item = content[kind ?? 'contact'];
  return <div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">{item.heading}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p></div>;
}

function ActionForm({ action, ids, onResult }: { action: Action; ids: Record<string, string>; onResult: (value: unknown) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<unknown>();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setResult(undefined);
    setLoading(true);
    try {
      const requestIds = { ...ids };
      for (const item of action.fields ?? []) if (item.inPath) requestIds[item.name] = values[item.name] ?? '';
      const body = action.body ? action.body(values, requestIds) : Object.fromEntries(
        (action.fields ?? []).filter((item) => !item.inPath && values[item.name] !== undefined && values[item.name] !== '')
          .map((item) => [item.name, item.type === 'number' ? Number(values[item.name]) : values[item.name]]),
      );
      const method = action.method ?? 'POST';
      const response = await api<unknown>(interpolate(action.endpoint, requestIds), {
        method,
        ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body) }),
      });
      setResult(response);
      onResult(response);
      const auth = response && typeof response === 'object' ? response as RecordValue : {};
      if (typeof auth.accessToken === 'string') window.localStorage.setItem('bigbiim.accessToken', auth.accessToken);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-slate-900">{action.label}</h3>
      {(action.fields ?? []).map((item) => (
        <label key={item.name} className="mt-4 block text-sm font-medium text-slate-700">
          {item.label}{item.required && <span aria-hidden="true"> *</span>}
          {item.type === 'textarea' || item.type === 'json' ? (
            <textarea required={item.required} rows={item.type === 'json' ? 4 : 3} value={values[item.name] ?? ''} placeholder={item.type === 'json' ? '{\n  \n}' : item.placeholder} onChange={(event) => setValues((current) => ({ ...current, [item.name]: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal text-slate-900 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-blue-100" />
          ) : (
            <input required={item.required} type={item.type ?? 'text'} value={values[item.name] ?? ''} placeholder={item.placeholder} onChange={(event) => setValues((current) => ({ ...current, [item.name]: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal text-slate-900 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-blue-100" />
          )}
        </label>
      ))}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {result !== undefined && <div role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"><p className="font-medium">Réponse reçue du serveur.</p><DataCards value={result} emptyMessage="Le serveur n’a retourné aucun détail." /></div>}
      <button disabled={loading} className="mt-5 min-h-11 rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:cursor-wait disabled:opacity-60">
        {loading ? 'Envoi en cours…' : action.label}
      </button>
    </form>
  );
}

export default function WorkspaceScreen({ code, name, description }: { code?: string; name: string; description: string }) {
  const pathname = usePathname();
  const config = useMemo(() => resolveScreen(pathname), [pathname]);
  const parts = pathname.split('/').filter(Boolean);
  const ids = useMemo(() => ({
    id: parts[0] === 'client' || (parts[0] === 'prestataire' && parts[1] === 'missions') ? parts[2] ?? '' : parts[1] ?? '',
    milestoneId: parts[3] === 'jalons' ? parts[4] ?? '' : '',
    contractId: '',
    missionId: parts[parts[0] === 'prestataire' ? 2 : 4] ?? '',
    notificationId: '',
    providerId: parts[0] === 'prestataires' ? parts[1] : '',
    disputeId: '',
  }), [pathname]);
  const [query, setQuery] = useState('');
  const [data, setData] = useState<ScreenData>({ loading: false });
  const [extraData, setExtraData] = useState<Record<string, ScreenData>>({});
  const [refresh, setRefresh] = useState(0);
  const [actionResponse, setActionResponse] = useState<unknown>();

  const load = useCallback(async () => {
    if (!config.endpoint) return;
    setData({ loading: true });
    const path = interpolate(config.endpoint, ids);
    const requestPath = config.search && query ? `${path}?q=${encodeURIComponent(query)}` : path;
    try {
      const value = await api<unknown>(requestPath);
      setData({ value, loading: false });
    } catch (reason) {
      setData({ error: reason instanceof Error ? reason.message : 'Une erreur est survenue.', loading: false });
    }
  }, [config.endpoint, config.search, ids, query]);

  useEffect(() => { void load(); }, [load, refresh]);
  useEffect(() => {
    let active = true;
    if (!config.extras?.length) return () => { active = false; };
    const loadExtras = async () => {
      const results: Record<string, ScreenData> = {};
      await Promise.all(config.extras?.map(async (item) => {
        try {
          results[item.title] = { value: await api(interpolate(item.endpoint, ids)), loading: false };
        } catch (reason) {
          results[item.title] = { error: reason instanceof Error ? reason.message : 'Une erreur est survenue.', loading: false };
        }
      }) ?? []);
      if (active) setExtraData(results);
    };
    setExtraData(Object.fromEntries(config.extras.map((item) => [item.title, { loading: true }])));
    void loadExtras();
    return () => { active = false; };
  }, [config.extras, ids, refresh]);

  const title = config.title || name;
  const isEmpty = !data.loading && !data.error && getItems(data.value).length === 0;
  const links = [...(config.links ?? []), ...(pathname.startsWith('/prestataire') ? providerLinks : pathname.startsWith('/client') ? clientLinks : commonLinks)]
    .filter(([href], index, all) => all.findIndex((entry) => entry[0] === href) === index);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Link href="/" className="text-xl font-extrabold tracking-tight text-brand-blue">BIGBIIM<span className="text-brand-orange">.</span></Link>
          <nav aria-label="Navigation principale" className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
            {commonLinks.map(([href, label]) => <Link key={href} href={href} className="hover:text-brand-blue">{label}</Link>)}
            <Link href="/client" className="hover:text-brand-blue">Espace client</Link>
            <Link href="/prestataire" className="hover:text-brand-blue">Espace prestataire</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-orange">{code ?? (pathname.startsWith('/client') ? 'Espace client' : pathname.startsWith('/prestataire') ? 'Espace prestataire' : 'BIGBIIM')}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-blue sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">{config.description || description}</p>
        </div>

        {config.search && (
          <form onSubmit={(event) => { event.preventDefault(); setRefresh((value) => value + 1); }} className="mt-7 flex max-w-2xl flex-col gap-2 sm:flex-row">
            <label htmlFor="activity-search" className="sr-only">Rechercher une activité</label>
            <input id="activity-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Que souhaitez-vous organiser ?" className="min-h-12 flex-1 rounded-lg border border-slate-300 bg-white px-4 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-blue-100" />
            <button className="min-h-12 rounded-lg bg-brand-blue px-5 font-semibold text-white hover:bg-blue-900">Rechercher</button>
          </form>
        )}

        {links.length > 0 && (
          <nav aria-label="Raccourcis" className="mt-6 flex flex-wrap gap-2">
            {links.map(([href, label]) => <Link key={`${href}-${label}`} href={interpolate(href, ids)} className="rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-medium text-brand-blue hover:border-brand-blue">{label}</Link>)}
          </nav>
        )}

        {pathname === '/' && (
          <section className="mt-10 grid gap-4 md:grid-cols-3">
            {[['Une demande, les bons profils', 'Présentez votre besoin et trouvez des professionnels complémentaires.'], ['Un projet suivi au même endroit', 'Retrouvez les échanges, jalons et documents dans votre espace client.'], ['Des missions adaptées', 'Les prestataires consultent et gèrent leurs offres depuis leur espace.']].map(([heading, body]) => <article key={heading} className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-brand-blue">{heading}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{body}</p></article>)}
          </section>
        )}

        {config.staticContent && <section className="mt-8"><StaticContent kind={config.staticContent} /></section>}

        {config.endpoint && (
          <section className="mt-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-slate-900">{pathname === '/' ? 'Activités disponibles' : config.title}</h2>
              <button onClick={() => setRefresh((value) => value + 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-brand-blue">Actualiser</button>
            </div>
            {data.loading && <p role="status" className="rounded-xl bg-white p-5 text-sm text-slate-600">Chargement des données…</p>}
            {data.error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">Impossible de charger ces données.</p><p className="mt-1">{data.error}</p></div>}
            {isEmpty && <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Aucun résultat n’est disponible pour le moment.</p>}
            {!data.loading && !data.error && <DataCards value={data.value} emptyMessage="Aucune donnée à afficher." linkBase={pathname === '/client' ? '/client/projets/:id' : pathname === '/activites' || pathname === '/' ? '/activites/:id' : pathname === '/prestataire' || pathname === '/prestataire/offres' ? '/prestataire/missions/:id' : undefined} />}
            {actionResponse !== undefined && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-semibold text-emerald-900">Réponse reçue du serveur.</p><DataCards value={actionResponse} emptyMessage="Le serveur n’a retourné aucun détail." /></div>}
          </section>
        )}

        {config.extras?.map((extra) => {
          const result = extraData[extra.title] ?? { loading: true };
          return <section key={extra.title} className="mt-8">
            <h2 className="mb-4 text-xl font-semibold">{extra.title}</h2>
            {result.loading && <p role="status" className="rounded-xl bg-white p-4 text-sm text-slate-600">Chargement…</p>}
            {result.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{result.error}</p>}
            {!result.loading && !result.error && <DataCards value={result.value} emptyMessage="Aucun élément disponible." />}
          </section>;
        })}

        {!!config.actions?.length && (
          <section className="mt-10">
            <h2 className="mb-4 text-xl font-semibold">Actions disponibles</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {config.actions.map((action) => <ActionForm key={action.label} action={action} ids={ids} onResult={(value) => { setActionResponse(value); setRefresh((current) => current + 1); }} />)}
            </div>
          </section>
        )}
      </main>
      <footer className="mt-12 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:justify-between sm:px-6">
          <span>BIGBIIM · Une activité. Toute l’équipe.</span>
          <div className="flex gap-4"><Link href="/legal" className="hover:text-brand-blue">Informations légales</Link><Link href="/contact" className="hover:text-brand-blue">Contact</Link></div>
        </div>
      </footer>
    </div>
  );
}
