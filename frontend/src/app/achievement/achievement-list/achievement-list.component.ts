import {Component, OnInit} from '@angular/core';
import {Observable, of} from 'rxjs';
import {MatTabChangeEvent} from '@angular/material/tabs';
import {AchievementService} from '../../_services/achievement.service';
import {AccountService} from '../../_services/account.service';
import {AchievementCategory, AchievementDTO} from '../../_models/achievement';
import {ActivatedRoute, Router} from '@angular/router';
import {PlayerService} from "../../_services/player.service";
import {map, startWith} from "rxjs/operators";
import {FormControl} from "@angular/forms";

@Component({
  selector: 'app-achievement-list',
  templateUrl: './achievement-list.component.html',
  styleUrls: ['./achievement-list.component.scss'],
  standalone: false
})
export class AchievementListComponent implements OnInit {
  // Player ID from current authenticated user
  playerId: string = '';
  username: string | null = null;
  playerUsernames: string[] = [];
  filteredUsernames: Observable<string[]>;
  searchControl = new FormControl();
  error: string = '';

  // Achievement data
  allAchievements$: Observable<AchievementDTO[]> = of([]);
  earnedAchievements$: Observable<AchievementDTO[]> = of([]);

  // Category filters
  categories = Object.values(AchievementCategory);
  selectedCategory: AchievementCategory | 'ALL' = 'ALL';

  // Sort options
  sortOptions = [
    {value: 'category', label: 'Category'},
    {value: 'name', label: 'Name'},
    {value: 'progress', label: 'Progress'},
    {value: 'points', label: 'Points'},
    {value: 'dateEarned', label: 'Date Earned'}
  ];
  selectedSort = 'category';

  // View options
  viewOptions = [
    {value: 'grid', icon: 'grid_view', label: 'Grid View'},
    {value: 'list', icon: 'view_list', label: 'List View'}
  ];
  selectedView = 'grid';

  // Loading state
  loading = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private achievementService: AchievementService,
    private accountService: AccountService,
    private playerService: PlayerService
  ) {
  }


  ngOnInit(): void {
    // Check route params for username
    this.route.paramMap.subscribe(params => {
      this.username = params.get('username');

      // Get current player ID
      const player = this.accountService.playerValue?.player;
      if (this.username) {
        // If username is provided, load that player's achievements
        this.loadPlayerByUsername(this.username);
      } else if (player) {
        this.playerId = player.playerId;
        this.loadAchievements();
      }
    });
    this.loadUsernames();
  }

  loadPlayerByUsername(username: string): void {
    this.loading = true;

    // Get player by username first
    this.playerService.getPlayerByUsername(username).subscribe({
      next: (player) => {
        if (player) {
          this.playerId = player.playerId;
          this.loadAchievements();
        } else {
          this.error = `Player with username "${username}" not found`;
          this.loading = false;
        }
      },
      error: (err) => {
        console.error('Error loading player:', err);
        this.error = `Failed to load player with username "${username}"`;
        this.loading = false;
      }
    });
  }

  backToMyAchievements(): void {
    this.router.navigate(['/achievements']);
  }

  /**
   * Navigate back to the authenticated player's profile
   */
  backToMyProfile(): void {
    this.router.navigate(['/achievements']);
  }

  loadUsernames(): void {
    this.playerService.getPlayerUsernames().subscribe(usernames => {
      this.playerUsernames = usernames || [];
      // Setup autocomplete filtering
      this.filteredUsernames = this.searchControl.valueChanges.pipe(
        startWith(''),
        map(value => this._filterUsernames(value || ''))
      );
    });
  }

  searchPlayer(): void {
    const username = this.searchControl.value;
    if (username && typeof username === 'string' && username.trim() !== '') {
      this.router.navigate(['/achievements', username.trim()]);
    }
  }

  /**
   * Load achievements from the API
   */
  loadAchievements(): void {
    this.loading = true;

    // Get all player achievements
    this.allAchievements$ = this.achievementService.getPlayerAchievements(this.playerId);

    // Get only earned achievements and ensure percentComplete is 100
    this.earnedAchievements$ = this.achievementService.getPlayerEarnedAchievements(this.playerId)
      .pipe(
        map(achievements => achievements.map(achievement => ({
          ...achievement,
          percentComplete: 100 // Fix: ensure earned achievements show 100% progress
        })))
      );

    this.loading = false;
  }

  /**
   * Handle tab change event
   */
  onTabChange(event: MatTabChangeEvent): void {
    // Reset filters when changing tabs
    this.selectedCategory = 'ALL';
    this.selectedSort = 'category';
  }

  /**
   * Filter achievements by category
   */
  filterByCategory(achievements: AchievementDTO[]): AchievementDTO[] {
    if (!achievements) return [];
    if (this.selectedCategory === 'ALL') return achievements;

    return achievements.filter(a =>
      a.achievement?.category === this.selectedCategory
    );
  }

  /**
   * Sort achievements based on selected sort option
   */
  sortAchievements(achievements: AchievementDTO[]): AchievementDTO[] {
    if (!achievements) return [];

    return [...achievements].sort((a, b) => {
      switch (this.selectedSort) {
        case 'name':
          return (a.achievement?.name || '').localeCompare(b.achievement?.name || '');

        case 'progress':
          return (b.percentComplete || 0) - (a.percentComplete || 0);

        case 'points':
          return (b.achievement?.points || 0) - (a.achievement?.points || 0);

        case 'dateEarned':
          // Sort by date earned (nulls last)
          if (!a.playerProgress?.dateEarned) return 1;
          if (!b.playerProgress?.dateEarned) return -1;
          return new Date(b.playerProgress.dateEarned).getTime() -
            new Date(a.playerProgress.dateEarned).getTime();

        case 'category':
        default:
          // First by category, then by name
          const catCompare = this.getCategoryWeight(a.achievement?.category) -
            this.getCategoryWeight(b.achievement?.category);
          return catCompare !== 0 ? catCompare : (a.achievement?.name || '').localeCompare(b.achievement?.name || '');
      }
    });
  }

  /**
   * Get completion stats for progress bar
   */
  getCompletionStats(achievements: AchievementDTO[]): { earned: number, total: number, percent: number } {
    if (!achievements || achievements.length === 0) {
      return {earned: 0, total: 0, percent: 0};
    }

    const earned = achievements.filter(a => a.playerProgress?.achieved).length;
    const total = achievements.length;
    const percent = total > 0 ? Math.round((earned / total) * 100) : 0;

    return {earned, total, percent};
  }

  /**
   * Calculate total achievement points
   */
  getTotalPoints(achievements: AchievementDTO[]): number {
    if (!achievements) return 0;

    return achievements
      .filter(a => a.playerProgress?.achieved)
      .reduce((sum, a) => sum + (a.achievement?.points || 0), 0);
  }

  /**
   * Manual refresh of achievements (for testing and development)
   */
  refreshAchievements(): void {
    this.loading = true;
    this.achievementService.recalculatePlayerAchievements(this.playerId).subscribe({
      next: () => {
        this.loadAchievements();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  // Add this filter method
  private _filterUsernames(value: string): string[] {
    const filterValue = value.toLowerCase();
    return this.playerUsernames.filter(username =>
      username.toLowerCase().includes(filterValue)
    );
  }

  /**
   * Get weight for category (for sorting)
   */
  private getCategoryWeight(category?: AchievementCategory): number {
    if (!category) return 0;

    switch (category) {
      case AchievementCategory.EASY:
        return 1;
      case AchievementCategory.MEDIUM:
        return 2;
      case AchievementCategory.HARD:
        return 3;
      case AchievementCategory.LEGENDARY:
        return 4;
      default:
        return 0;
    }
  }
}
