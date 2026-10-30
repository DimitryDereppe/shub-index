/**
 * Import d'un film TMDB dans le catalogue : le film, sa saga, ses genres, ses studios, ses réalisateurs
 * et ses premiers rôles, dans UNE transaction (tout ou rien).
 *
 * Un film déjà présent (même tmdb_id) n'est PAS réimporté : on garde ainsi les
 * corrections manuelles d'un admin (US29) et on économise des appels TMDB.
 */
import { config } from "../../config.ts";
import genresDataMapper from "../models/genres.datamapper.ts";
import moviesDataMapper from "../models/movies.datamapper.ts";
import peopleDataMapper from "../models/people.datamapper.ts";
import sagasDataMapper from "../models/sagas.datamapper.ts";
import studiosDataMapper from "../models/studios.datamapper.ts";
import { UNIQUE_VIOLATION } from "../models/scans.datamapper.ts";
import { withTransaction } from "../models/transaction.ts";
import { getMovieWithCredits, toMovieImport, type TmdbMovieDetails } from "./tmdb.client.ts";

/**
 * @param details fiche TMDB complète (avec credits et release_dates)
 * @returns l'id du film en base (existant ou nouvellement créé)
 */
export async function importMovie(details: TmdbMovieDetails): Promise<number> {
  const existingId = await moviesDataMapper.findIdByTmdbId(details.id);
  if (existingId) {
    return existingId;
  }

  const movie = toMovieImport(details, config.castLimit);

  try {
    return await withTransaction(async (tx) => {
      // la saga d'abord : le film a besoin de son id (clé étrangère movie.saga_id)
      const sagaId = movie.saga ? await sagasDataMapper.upsertFromTmdb(movie.saga, tx) : null;
      const movieId = await moviesDataMapper.create(movie, sagaId, tx);

      const genreIds = await genresDataMapper.upsertFromTmdb(movie.genres, tx);
      await moviesDataMapper.addGenres(movieId, genreIds, tx);

      const studioIds = await studiosDataMapper.upsertFromTmdb(movie.studios, tx);
      await moviesDataMapper.addStudios(movieId, studioIds, tx);

      // une même personne peut réaliser ET jouer (RG3) : on la dédoublonne avant l'upsert
      const peopleByTmdbId = new Map<number, { tmdbId: number; name: string }>();
      for (const person of [...movie.directors, ...movie.cast]) {
        peopleByTmdbId.set(person.tmdbId, { tmdbId: person.tmdbId, name: person.name });
      }
      const personIds = await peopleDataMapper.upsertFromTmdb([...peopleByTmdbId.values()], tx);

      await moviesDataMapper.addDirectors(
        movieId,
        movie.directors.map((director) => personIds.get(director.tmdbId)!), // "!" : forcément présent, on vient de l'insérer
        tx
      );
      await moviesDataMapper.addCast(
        movieId,
        movie.cast.map((member) => ({
          personId: personIds.get(member.tmdbId)!,
          character: member.character,
          order: member.order,
        })),
        tx
      );

      return movieId;
    });
  } catch (error) {
    // le même film importé au même moment ailleurs (indexation + association manuelle) :
    // la contrainte UNIQUE sur tmdb_id a refusé le 2ᵉ INSERT → on reprend le film déjà créé
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      const id = await moviesDataMapper.findIdByTmdbId(details.id);
      if (id) {
        return id;
      }
    }
    throw error;
  }
}

/** Variante utilisée par l'association manuelle (PATCH /media-files/:id) : on part d'un id TMDB. */
export async function importMovieByTmdbId(tmdbId: number): Promise<number> {
  const existingId = await moviesDataMapper.findIdByTmdbId(tmdbId);
  if (existingId) {
    return existingId;
  }
  return importMovie(await getMovieWithCredits(tmdbId));
}
