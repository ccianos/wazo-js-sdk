// @flow

import Session from './Session';
import { LINE_STATE } from './Profile';
import newFrom from '../utils/new-from';
import type { DirectorySource } from './DirectorySource';

export type NewContact = {
  firstName: string,
  lastName: string,
  phoneNumber: string,
  email: ?string,
  address: ?string,
  entreprise: ?string,
  birthday: ?string,
  note: ?string,
};

export type ContactResponse = {
  source: string,
  backend: string,
  column_values: Array<any>,
  relations: {
    user_id: number,
    xivo_id: string,
    agent_id: ?number,
    endpoint_id: number,
    user_uuid: string,
    source_entry_id: string,
  },
};

export type ContactsResponse = {
  column_types: Array<?string>,
  term: string,
  column_headers: Array<string>,
  results: Array<ContactResponse>,
};

export type ContactPersonalResponse = {
  id: string,
  firstName: ?string,
  lastName: ?string,
  number: ?string,
  numbers: ?Array<{ label: string, number: string }>,
  email: ?string,
  numbers: ?Array<{ label: string, email: string }>,
  entreprise: ?string,
  birthday: ?string,
  address: ?string,
  note: ?string,
  // @TODO: legacy ?
  firstname: ?string,
  lastname: ?string,
  backend: ?string,
};

// @see: https://github.com/rt2zz/react-native-contacts#example-contact-record
export type ContactMobileResponse = {
  recordID: string,
  company: string,
  emailAddresses: Array<{
    label: string,
    email: string,
  }>,
  givenName: string,
  familyName: string,
  middleName: string,
  jobTitle: string,
  note: string,
  urlAddresses: Array<{
    label: string,
    url: string,
  }>,
  phoneNumbers: Array<{
    label: string,
    number: string,
  }>,
  hasThumbnail: boolean,
  thumbnailPath: string,
  postalAddresses: Array<{
    street: string,
    city: string,
    state: string,
    region: string,
    postCode: string,
    country: string,
    label: string,
  }>,
  birthday: {
    year: number,
    month: number,
    day: number,
  },
};

type ContactArguments = {
  id?: string,
  uuid?: string,
  name?: string,
  number?: string,
  numbers?: Array<{ label: string, number: string }>,
  favorited?: boolean,
  email?: string,
  emails?: Array<{ label: string, email: string }>,
  entreprise?: string,
  birthday?: string,
  address?: string,
  note?: string,
  endpointId?: number,
  personal?: boolean,
  presence?: string,
  source?: string,
  sourceId?: string,
  status?: string,
  endpointId?: number,
  uuid?: string,
  backend?: string,
  personalStatus?: string,
};

type Office365Response = {
  assistantName: any,
  birthday: any,
  businessAddress: any,
  businessHomePage: any,
  businessPhones: Array<any>,
  categories: Array<any>,
  changeKey: string,
  children: Array<any>,
  companyName: any,
  createdDateTime: string,
  department: any,
  displayName: string,
  emailAddresses: Array<{ name: string, address: string }>,
  fileAs: string,
  generation: any,
  givenName: any,
  homeAddress: any,
  homePhones: string[],
  id: string,
  imAddresses: any,
  initials: any,
  jobTitle: any,
  lastModifiedDateTime: string,
  manager: any,
  middleName: any,
  mobilePhone: string,
  nickName: any,
  officeLocation: any,
  otherAddress: any,
  parentFolderId: string,
  personalNotes: string,
  profession: any,
  spouseName: any,
  surname: string,
  title: any,
  yomiCompanyName: any,
  yomiGivenName: any,
  yomiSurname: any,
};

type WazoResponse = {
  email: string,
  exten: string,
  firstname: string,
  lastname: string,
  mobile_phone_number: any,
  uuid: string,
  voicemail_number: any,
};

type GoogleResponse = {
  emails: string[],
  id: string,
  name: string,
  numbers: string[],
  numbers_by_label: any,
};

const SOURCE_MOBILE = 'mobile';

export default class Contact {
  id: ?string;
  uuid: ?string;
  name: ?string;
  number: ?string;
  numbers: ?Array<{ label: string, number: string }>;
  favorited: ?boolean;
  email: ?string;
  emails: ?Array<{ label: string, email: string }>;
  entreprise: ?string;
  birthday: ?string;
  address: ?string;
  note: ?string;
  endpointId: ?number;
  personal: ?boolean;
  presence: ?string;
  source: ?string;
  sourceId: string;
  status: ?string;
  backend: ?string;
  personalStatus: string;

  static merge(oldContacts: Array<Contact>, newContacts: Array<Contact>): Array<Contact> {
    return newContacts.map(current => {
      const old = oldContacts.find(contact => contact.is(current));

      return typeof old !== 'undefined' ? current.merge(old) : current;
    });
  }

  static sortContacts(a: Contact, b: Contact) {
    const aNames = a.separateName();
    const bNames = b.separateName();
    const aLastName = aNames.lastName;
    const bLastName = bNames.lastName;

    // last Name can be empty
    if (aLastName === bLastName) {
      return aNames.firstName.localeCompare(bNames.firstName);
    }

    return aLastName.localeCompare(bLastName);
  }

  static parseMany(response: ContactsResponse): Array<Contact> {
    return response.results.map(r => Contact.parse(r, response.column_types));
  }

  static parseMultipleNumber(plain: ContactResponse, columns: Array<?string>) {
    const numberColumns = columns
      .map((e, index) => ({ index, columnName: e }))
      .filter(e => e.columnName === 'number')
      .map(e => e.index);

    const number = plain.column_values.find((e, index) => numberColumns.some(i => i === index) && e !== null);

    return number || '';
  }

  static parse(plain: ContactResponse, columns: Array<?string>): Contact {
    const number = Contact.parseMultipleNumber(plain, columns);
    const email = plain.column_values[columns.indexOf('email')];
    return new Contact({
      name: plain.column_values[columns.indexOf('name')],
      number: number || '',
      numbers: number ? [{ label: 'primary', number }] : [],
      favorited: plain.column_values[columns.indexOf('favorite')],
      email: email || '',
      emails: email ? [{ label: 'primary', email }] : [],
      entreprise: plain.column_values[columns.indexOf('entreprise')] || '',
      birthday: plain.column_values[columns.indexOf('birthday')] || '',
      address: plain.column_values[columns.indexOf('address')] || '',
      note: plain.column_values[columns.indexOf('note')] || '',
      endpointId: plain.relations.endpoint_id,
      personal: plain.column_values[columns.indexOf('personal')],
      source: plain.source,
      sourceId: plain.relations.source_entry_id,
      uuid: plain.relations.user_uuid,
      backend: plain.backend || '',
    });
  }

  static parseManyPersonal(results: Array<ContactPersonalResponse>): Array<?Contact> {
    return results.map(r => Contact.parsePersonal(r));
  }

  static parsePersonal(plain: ContactPersonalResponse): Contact {
    return new Contact({
      name: `${plain.firstName || plain.firstname || ''} ${plain.lastName || plain.lastname || ''}`,
      number: plain.number || '',
      numbers: plain.number ? [{ label: 'primary', number: plain.number }] : [],
      email: plain.email || '',
      emails: plain.email ? [{ label: 'primary', email: plain.email }] : [],
      source: 'personal',
      sourceId: plain.id,
      entreprise: plain.entreprise || '',
      birthday: plain.birthday || '',
      address: plain.address || '',
      note: plain.note || '',
      favorited: false,
      personal: true,
      backend: plain.backend || 'personal',
    });
  }

  static parseMobile(plain: ContactMobileResponse): Contact {
    let address = '';
    if (plain.postalAddresses.length) {
      const postalAddress = plain.postalAddresses[0];

      address = `${postalAddress.street} ${postalAddress.city} ${postalAddress.postCode} ${postalAddress.country}`;
    }

    return new Contact({
      name: `${plain.givenName || ''} ${plain.familyName || ''}`,
      number: plain.phoneNumbers.length ? plain.phoneNumbers[0].number : '',
      numbers: plain.phoneNumbers.length ? [{ label: 'primary', number: plain.phoneNumbers[0].number }] : [],
      email: plain.emailAddresses.length ? plain.emailAddresses[0].email : '',
      emails: plain.emailAddresses.length ? [{ label: 'primary', email: plain.emailAddresses[0].email }] : [],
      source: SOURCE_MOBILE,
      sourceId: plain.recordID,
      birthday: plain.birthday ? `${plain.birthday.year}-${plain.birthday.month}-${plain.birthday.day}` : '',
      address,
      note: plain.note || '',
      favorited: false,
      personal: true,
    });
  }

  static parseManyOffice365(response: Office365Response[], source: DirectorySource): Array<Contact> {
    return response.map(r => Contact.parseOffice365(r, source));
  }

  static parseOffice365(single: Office365Response, source: DirectorySource): Contact {
    const emails = [];
    const numbers = [];

    if (single.emailAddresses) {
      const formattedEmails = single.emailAddresses.map(email => ({ label: 'email', email: email.address }));
      emails.push(...formattedEmails);
    }

    if (single.homePhones) {
      const formattedPhones = single.homePhones.map(phone => ({ label: 'home', number: phone }));
      numbers.push(...formattedPhones);
    }

    if (single.mobilePhone) {
      numbers.push({ label: 'mobile', number: single.mobilePhone });
    }

    return new Contact({
      sourceId: single.id,
      name: single.displayName,
      numbers,
      emails,
      source: source.name,
      backend: 'office365',
    });
  }

  static parseManyGoogle(response: GoogleResponse[], source: DirectorySource): Array<Contact> {
    return response.map(r => Contact.parseGoogle(r, source));
  }

  static parseGoogle(single: GoogleResponse, source: DirectorySource): Contact {
    const emails = [];
    const numbers = [];

    if (single.emails) {
      const formattedEmails = single.emails.map(email => ({ label: 'email', email }));
      emails.push(...formattedEmails);
    }

    if (single.numbers) {
      const formattedPhones = single.numbers.map(phone => ({ label: 'mobile', number: phone }));
      numbers.push(...formattedPhones);
    }

    return new Contact({
      sourceId: single.id,
      name: single.name,
      numbers,
      emails,
      source: source.name,
      backend: 'google',
    });
  }

  static parseManyWazo(response: WazoResponse[], source: DirectorySource): Array<Contact> {
    return response.map(r => Contact.parseWazo(r, source));
  }

  static parseWazo(single: WazoResponse, source: DirectorySource): Contact {
    const emails = [];
    const numbers = [];

    if (single.email) {
      emails.push({ label: 'email', email: single.email });
    }

    if (single.exten) {
      numbers.push({ label: 'exten', number: single.exten })
    }

    if (single.mobile_phone_number) {
      numbers.push({ label: 'mobile', number: single.mobile_phone_number });
    }

    return new Contact({
      uuid: single.uuid,
      sourceId: single.uuid,
      name: `${single.firstname} ${single.lastname}`,
      numbers,
      emails,
      source: source.name,
      backend: 'wazo',
    });
  }

  static newFrom(profile: Contact) {
    return newFrom(profile, Contact);
  }

  constructor({
    id,
    uuid,
    name,
    number,
    numbers,
    email,
    emails,
    source,
    sourceId,
    entreprise,
    birthday,
    address,
    note,
    presence,
    status,
    endpointId,
    personal,
    favorited,
    backend,
    personalStatus,
  }: ContactArguments = {}) {
    this.id = id;
    this.uuid = uuid;
    this.name = name;
    this.number = number;
    this.numbers = numbers;
    this.email = email;
    this.emails = emails;
    this.source = source;
    this.sourceId = sourceId || '';
    this.entreprise = entreprise;
    this.birthday = birthday;
    this.address = address;
    this.note = note;
    this.presence = presence;
    this.status = status;
    this.endpointId = endpointId;
    this.personal = personal;
    this.favorited = favorited;
    this.backend = backend;
    this.personalStatus = personalStatus || '';
  }

  setFavorite(value: boolean) {
    this.favorited = value;

    return this;
  }

  is(other: Contact): boolean {
    const sameSourceId = !!this.sourceId && !!other.sourceId && this.sourceId === other.sourceId;
    const sameUuid = !!this.uuid && !!other.uuid && this.uuid === other.uuid;
    const hasSameId = sameSourceId || sameUuid;

    const hasSameBackend = !!this.backend && !!other.backend && this.backend === other.backend;

    return !!other && hasSameId && hasSameBackend;
  }

  hasId(id: string): boolean {
    return this.uuid === id;
  }

  hasNumber(number: string): boolean {
    return this.number === number;
  }

  hasEndpointId(endpointId: number): boolean {
    return this.endpointId === endpointId;
  }

  isAvailable(): boolean {
    return this.presence === 'available';
  }

  isDoNotDisturb(): boolean {
    return this.presence === 'donotdisturb';
  }

  isDisconnected(): boolean {
    return this.presence === 'disconnected';
  }

  isInCall(): boolean {
    return this.status === LINE_STATE.TALKING || this.status === LINE_STATE.HOLDING;
  }

  isRinging(): boolean {
    return this.status === LINE_STATE.RINGING;
  }

  isInUseOrRinging(): boolean {
    return this.status === LINE_STATE.TALKING || this.status === LINE_STATE.RINGING;
  }

  merge(old: Contact): Contact {
    this.presence = old.presence;
    this.status = old.status;

    return this;
  }

  isIntern(): boolean {
    return !!this.uuid;
  }

  isCallable(session: Session): boolean {
    return !!this.number && !!session && !session.is(this);
  }

  isFromMobile() {
    return this.source === SOURCE_MOBILE;
  }

  isFavorite() {
    return this.favorited;
  }

  separateName(): { firstName: string, lastName: string } {
    if (!this.name) {
      return {
        firstName: '',
        lastName: '',
      };
    }
    const names = this.name.split(/\s+/);
    const firstName = names[0];
    const lastName = names.slice(1).join(' ');

    return {
      firstName,
      lastName,
    };
  }
}
